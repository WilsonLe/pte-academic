"""Verify generated speech hashes, decode, transcript coverage and alignment quality."""

import argparse
import json
import numpy as np
from comparison import (
    Acoustic,
    CORPUS,
    DATA,
    ROOT,
    digest,
    load_audio,
    tokenize,
    signal_valid,
    write_json,
    reference_stream,
)


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
    args = p.parse_args()
    path = DATA / "corpus-audit.json"
    try:
        previous = json.loads(path.read_text())["takes"]
    except FileNotFoundError:
        previous = []
    done = {t["takeId"]: t for t in previous}
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    config = json.loads((ROOT / "training/reference-corpus.json").read_text())
    acoustic = Acoustic("words")
    for take in reference_stream(
        manifest["takes"], args.follow, len(config["passages"]) * len(config["voices"])
    ):
        file = CORPUS / take["file"]
        actual = digest(file)
        if actual != take["audioSha256"]:
            raise ValueError("Reference hash mismatch: " + take["takeId"])
        if take["takeId"] in done:
            if done[take["takeId"]]["audioSha256"] != actual:
                raise ValueError("Stale audio audit.")
            continue
        audio = load_audio(file)
        text = acoustic.transcribe(audio)
        wer = word_error(take["text"], text)
        result = {
            "takeId": take["takeId"],
            "audioSha256": actual,
            "seconds": len(audio) / 16000,
            "transcript": text,
            "wordErrorRate": wer,
            "validSignal": signal_valid(audio),
            "usable": bool(wer <= 0.25 and signal_valid(audio)),
        }
        done[take["takeId"]] = result
        write_json(
            path,
            {
                "schemaVersion": 1,
                "recognizer": {
                    "repository": "facebook/wav2vec2-base-960h",
                    "revision": acoustic.revision,
                },
                "takes": list(done.values()),
                "count": len(done),
                "usable": sum(t["usable"] for t in done.values()),
                "medianWordErrorRate": float(
                    np.median([t["wordErrorRate"] for t in done.values()])
                ),
                "humanListeningReview": "pending; automated coverage is not human listening",
            },
        )
        print(
            json.dumps(
                {
                    "audited": len(done),
                    "takeId": take["takeId"],
                    "wordErrorRate": wer,
                    "usable": result["usable"],
                }
            ),
            flush=True,
        )
    final = json.loads((CORPUS / "manifest.json").read_text())
    report = json.loads(path.read_text())
    report["referenceManifestSha256"] = digest(CORPUS / "manifest.json")
    report["generationIdsPresent"] = all(t["generationId"] for t in final["takes"])
    report["distinctTexts"] = len({t["text"] for t in final["takes"]})
    report["estimatedInputCostUsd"] = sum(
        t["estimatedInputCostUsd"] for t in final["takes"]
    )
    report["totalSeconds"] = sum(t["seconds"] for t in done.values())
    write_json(path, report)


if __name__ == "__main__":
    main()
