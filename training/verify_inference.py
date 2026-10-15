"""Exercise the persisted model through the actual local-audio prediction path."""

import argparse
from argparse import Namespace
import json
import socket
import time
from unittest.mock import patch
import numpy as np
import soundfile as sf
from comparison import DATA, digest, load_audio, predict, write_json
from experiment import Experiment


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--config")
    args = p.parse_args()
    experiment = Experiment.load(args.config)
    corpus = experiment.corpus
    folder = DATA / ("verification-" + experiment.reference_version)
    folder.mkdir(parents=True, exist_ok=True)
    manifest = experiment.manifest()
    ref = next(t for t in manifest["takes"] if t["takeId"] == "passage-083--am_puck")
    audio = load_audio(corpus / ref["file"])
    sf.write(folder / "quieter.wav", audio * 0.2, 16000, subtype="FLOAT")
    sf.write(folder / "silence.wav", np.zeros(16000, dtype=np.float32), 16000)
    sf.write(
        folder / "noise.wav",
        np.random.default_rng(5).normal(0, 0.1, 16000).astype(np.float32),
        16000,
        subtype="FLOAT",
    )
    controls = next(
        t for t in manifest["takes"] if t["takeId"] == "passage-054--af_heart"
    )

    timings = []

    def run(name, file, text=None):
        output = folder / (name + ".json")
        started = time.perf_counter()
        predict(
            Namespace(
                model=args.model,
                audio=str(file),
                text=text,
                output=str(output),
                device="auto",
            )
        )
        timings.append({"name": name, "wallSeconds": time.perf_counter() - started})
        return json.loads(output.read_text())

    with patch.object(
        socket.socket,
        "connect",
        side_effect=AssertionError("Prediction attempted network access"),
    ) as network:
        ordinary = run("expected-text", corpus / ref["file"], ref["text"])
        quieter = run("gain-control", folder / "quieter.wav", ref["text"])
        silence = run("silence", folder / "silence.wav", ref["text"])
        noise = run("noise", folder / "noise.wav", ref["text"])
        audio_only = run("audio-only", corpus / ref["file"])
        correct = run("correct-vowel", corpus / controls["file"], controls["text"])
        wrong = run(
            "wrong-vowel",
            corpus / controls["file"],
            controls["text"].replace("red ship", "red sheep"),
        )
        repeat = run("checkpoint-reload", corpus / ref["file"], ref["text"])
        accent_samples = {}
        if experiment.config["schemaVersion"] == 2:
            for accent in ["en-GB", "en-AU", "en-IN"]:
                take = next(
                    t
                    for t in manifest["takes"]
                    if t["id"] == "passage-083"
                    and t["accent"] == accent
                    and t["heldOut"]
                )
                sample = run(accent, corpus / take["file"], take["text"])
                scored_sample = [
                    s for s in sample["syllables"] if s["similarity"] is not None
                ]
                assert sample["status"] == "scored" and scored_sample, sample
                accent_samples[accent] = {
                    "takeId": take["takeId"],
                    "syllables": len(sample["syllables"]),
                    "scored": len(scored_sample),
                    "medianSimilarity": float(
                        np.median([s["similarity"] for s in scored_sample])
                    ),
                }
        network_calls = network.call_count
    scored = [s for s in ordinary["syllables"] if s["similarity"] is not None]
    assert (
        ordinary["status"] == "scored"
        and len(scored) / len(ordinary["syllables"]) >= 0.9
    )
    assert len(quieter["syllables"]) == len(ordinary["syllables"])
    differences = [
        abs(a["similarity"] - b["similarity"])
        for a, b in zip(ordinary["syllables"], quieter["syllables"])
        if a["similarity"] is not None and b["similarity"] is not None
    ]
    assert max(differences) < 1.0, differences
    assert silence["status"] == noise["status"] == "no-reliable-speech"
    assert audio_only["status"] == "scored" and len(audio_only["syllables"]) > 0
    assert ordinary["syllables"] == repeat["syllables"], (
        "Checkpoint reload changes deterministic prediction."
    )
    for s in ordinary["syllables"]:
        assert 0 <= s["start"] < s["end"] <= len(audio) / 16000
    correct_target = next(s for s in correct["syllables"] if s["word"] == "ship")
    wrong_target = next(s for s in wrong["syllables"] if s["word"] == "sheep")
    assert correct_target["similarity"] is not None
    assert (
        wrong_target["similarity"] is None
        or correct_target["similarity"] > wrong_target["similarity"]
    ), (correct_target, wrong_target)
    report = {
        "modelSha256": digest(args.model),
        "referenceManifestSha256": digest(corpus / "manifest.json"),
        "referenceVersion": experiment.reference_version,
        "sampleTakeId": ref["takeId"],
        "sampleSyllables": len(ordinary["syllables"]),
        "scoredSyllables": len(scored),
        "medianSimilarity": float(np.median([s["similarity"] for s in scored])),
        "gainControlMaxSimilarityChange": max(differences),
        "silenceStatus": silence["status"],
        "noiseStatus": noise["status"],
        "audioOnlyStatus": audio_only["status"],
        "audioOnlyTranscript": audio_only["text"],
        "checkpointReloadIdentical": True,
        "inferenceNetworkConnections": network_calls,
        "correctVowelSyllableSimilarity": correct_target["similarity"],
        "wrongVowelSyllableSimilarity": wrong_target["similarity"],
        "wrongVowelStatus": wrong_target["status"],
        "outputFolder": str(folder),
        "heldOutAccentSamples": accent_samples,
        "timings": timings,
        "scope": "Synthetic local audio controls; not human-speaker or browser validation.",
    }
    write_json(args.output, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
