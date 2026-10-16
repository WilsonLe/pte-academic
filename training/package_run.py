"""Bundle a trained candidate and compressed provenance; never include raw audio or secrets."""

import argparse
import gzip
import json
import shutil
from pathlib import Path

from comparison import ROOT, digest, load_checkpoint, verified_feature_files, write_json
from experiment import Experiment


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--run", required=True)
    p.add_argument("--destination", required=True)
    args = p.parse_args()
    experiment = Experiment.load(args.config)
    run = Path(args.run).resolve()
    destination = Path(args.destination).resolve()
    if not destination.is_relative_to(ROOT / "training/checkpoints"):
        raise ValueError("Package destination must be inside training/checkpoints/.")
    model = run / "model.pt"
    checkpoint, _ = load_checkpoint(model)
    provenance = json.loads((run / "training.json").read_text())
    manifest_hash = digest(experiment.corpus / "manifest.json")
    if checkpoint["referenceManifestSha256"] != manifest_hash or provenance[
        "modelSha256"
    ] != digest(model):
        raise ValueError("Model, training record and reference manifest do not agree.")
    files = verified_feature_files(experiment)
    evidence = [
        "training.json",
        "validation.json",
        "final-evaluation.json",
        "inference-verification.json",
    ]
    for name in evidence:
        report = json.loads((run / name).read_text())
        if (
            report["modelSha256"] != digest(model)
            or report["referenceManifestSha256"] != manifest_hash
        ):
            raise ValueError("Evidence does not describe this candidate: " + name)
    destination.mkdir(parents=True, exist_ok=True)
    for name in ["model.pt", *evidence]:
        shutil.copy2(run / name, destination / name)
    hashes = {}
    for name, source in [
        ("reference-manifest.json", experiment.corpus / "manifest.json"),
        ("corpus-audit.json", experiment.audit),
    ]:
        raw = source.read_bytes()
        compressed = destination / (name + ".gz")
        compressed.write_bytes(gzip.compress(raw, mtime=0))
        assert gzip.decompress(compressed.read_bytes()) == raw
        hashes[name] = {
            "sha256": digest(source),
            "gzipSha256": digest(compressed),
            "uncompressedBytes": len(raw),
        }
    write_json(
        destination / "artifact-summary.json",
        {
            "referenceVersion": experiment.reference_version,
            "modelSha256": digest(model),
            "recordings": experiment.expected,
            "usablePreparedRecordings": len(files),
            "distinctPassages": len(experiment.config["passages"]),
            "voiceProfiles": len(experiment.config["voices"]),
            "compressedEvidence": hashes,
            "rawAudioDirectory": str(experiment.corpus.relative_to(ROOT)),
            "sourceFiles": {
                str(p.relative_to(ROOT)): digest(p)
                for p in [
                    ROOT / "training/comparison.py",
                    ROOT / "training/phonetics.py",
                    ROOT / "training/experiment.py",
                    ROOT / "training/uv.lock",
                    experiment.path,
                ]
            },
        },
    )
    print(
        json.dumps(
            {
                "packaged": str(destination),
                "recordings": experiment.expected,
                "usablePreparedRecordings": len(files),
            }
        )
    )


if __name__ == "__main__":
    main()
