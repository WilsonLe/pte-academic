"""Exercise the persisted model through the actual local-audio prediction path."""

import argparse
from argparse import Namespace
import json
import socket
from unittest.mock import patch
import numpy as np
import soundfile as sf
from comparison import CORPUS, DATA, digest, load_audio, predict, write_json


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    folder = DATA / "verification"
    folder.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    ref = next(t for t in manifest["takes"] if t["takeId"] == "passage-083--am_puck")
    audio = load_audio(CORPUS / ref["file"])
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

    def run(name, file, text=None):
        output = folder / (name + ".json")
        predict(
            Namespace(
                model=args.model,
                audio=str(file),
                text=text,
                output=str(output),
                device="auto",
            )
        )
        return json.loads(output.read_text())

    with patch.object(
        socket.socket,
        "connect",
        side_effect=AssertionError("Prediction attempted network access"),
    ) as network:
        ordinary = run("expected-text", CORPUS / ref["file"], ref["text"])
        quieter = run("gain-control", folder / "quieter.wav", ref["text"])
        silence = run("silence", folder / "silence.wav", ref["text"])
        noise = run("noise", folder / "noise.wav", ref["text"])
        audio_only = run("audio-only", CORPUS / ref["file"])
        correct = run("correct-vowel", CORPUS / controls["file"], controls["text"])
        wrong = run(
            "wrong-vowel",
            CORPUS / controls["file"],
            controls["text"].replace("red ship", "red sheep"),
        )
        repeat = run("checkpoint-reload", CORPUS / ref["file"], ref["text"])
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
        "referenceManifestSha256": digest(CORPUS / "manifest.json"),
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
        "scope": "Synthetic local audio controls; not human-speaker or browser validation.",
    }
    write_json(args.output, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
