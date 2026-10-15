"""Batched local coverage audit of decoded, hash-verified generated speech."""

import argparse, json, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import torch
from comparison import (
    Acoustic,
    digest,
    load_audio,
    tokenize,
    signal_valid,
    write_json,
    reference_stream,
)
from experiment import Experiment


def word_error(reference, hypothesis):
    a, b = tokenize(reference), tokenize(hypothesis)
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        nxt = [i]
        for j, y in enumerate(b, 1):
            nxt.append(min(row[j] + 1, nxt[-1] + 1, row[j - 1] + (x != y)))
        row = nxt
    return row[-1] / max(1, len(a))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--follow", action="store_true")
    p.add_argument("--config")
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--device", default="auto")
    p.add_argument("--threads", type=int, default=6)
    args = p.parse_args()
    torch.set_num_threads(args.threads)
    experiment = Experiment.load(args.config)
    path = experiment.audit
    try:
        previous = json.loads(path.read_text())["takes"]
    except FileNotFoundError:
        previous = []
    done = {t["takeId"]: t for t in previous}
    acoustic = Acoustic("words", args.device)
    started = time.perf_counter()
    processed = 0

    def decode(take):
        file = experiment.corpus / take["file"]
        actual = digest(file)
        if actual != take["audioSha256"]:
            raise ValueError("Reference hash mismatch.")
        return load_audio(file)

    def checkpoint(final=False):
        report = {
            "schemaVersion": 2,
            "referenceVersion": experiment.reference_version,
            "recognizer": {
                "repository": "facebook/wav2vec2-base-960h",
                "revision": acoustic.revision,
            },
            "takes": list(done.values()),
            "count": len(done),
            "usable": sum(t["usable"] for t in done.values()),
            "medianWordErrorRate": float(
                np.median([t["wordErrorRate"] for t in done.values()])
            )
            if done
            else None,
            "humanListeningReview": "pending; automated coverage is not human listening",
            "batchSize": args.batch_size,
            "workers": args.workers,
            "processedNew": processed,
            "wallSeconds": time.perf_counter() - started,
        }
        if final:
            manifest = experiment.manifest()
            report.update(
                referenceManifestSha256=digest(experiment.corpus / "manifest.json"),
                generationIdsPresent=all(t["generationId"] for t in manifest["takes"]),
                distinctTexts=len({t["text"] for t in manifest["takes"]}),
                estimatedInputCostUsd=sum(
                    t["estimatedInputCostUsd"] for t in manifest["takes"]
                ),
                totalSeconds=sum(t["seconds"] for t in done.values()),
            )
        write_json(path, report)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = []

        def process_batch(takes):
            nonlocal processed
            takes.sort(key=lambda t: t["durationSeconds"])
            audios = list(pool.map(decode, takes))
            results = acoustic.run_batch(audios)
            for take, audio, (logs, _) in zip(takes, audios, results):
                text = acoustic.tokenizer.decode(logs.argmax(-1)).lower().strip()
                wer = word_error(take["text"], text)
                valid = signal_valid(audio)
                done[take["takeId"]] = {
                    "takeId": take["takeId"],
                    "audioSha256": take["audioSha256"],
                    "accent": take.get("accent", "en-US"),
                    "voice": take["voice"],
                    "seconds": len(audio) / 16000,
                    "transcript": text,
                    "wordErrorRate": wer,
                    "validSignal": valid,
                    "usable": bool(wer <= 0.25 and valid),
                }
            processed += len(takes)
            checkpoint()
            print(
                json.dumps(
                    {
                        "audited": len(done),
                        "total": experiment.expected,
                        "usable": sum(t["usable"] for t in done.values()),
                        "filesPerSecond": processed / (time.perf_counter() - started),
                    }
                ),
                flush=True,
            )

        for take in reference_stream(
            experiment.manifest()["takes"], args.follow, experiment.expected, experiment
        ):
            if take["takeId"] in done:
                if done[take["takeId"]]["audioSha256"] != take["audioSha256"]:
                    raise ValueError("Stale audio audit.")
                continue
            pending.append(take)
            if len(pending) >= args.batch_size:
                process_batch(pending)
                pending = []
        if pending:
            process_batch(pending)
    checkpoint(final=True)


if __name__ == "__main__":
    main()
