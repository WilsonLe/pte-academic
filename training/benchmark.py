"""Measure fixed-input acoustic batching and CPU feature throughput locally."""

import argparse, json, time
import numpy as np
import torch
from comparison import Acoustic, CORPUS, DATA, ROOT, digest, load_audio, write_json


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=str(DATA / "batch-benchmark.json"))
    args = p.parse_args()
    torch.set_num_threads(16)
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    takes = sorted(manifest["takes"][:64], key=lambda t: t["durationSeconds"])
    audios = [load_audio(CORPUS / t["file"]) for t in takes]
    acoustic = Acoustic()
    acoustic.run_batch(audios[:2])
    reports = []
    baseline = None
    for batch in [1, 4, 8, 16, 32]:
        started = time.perf_counter()
        outputs = []
        for off in range(0, len(audios), batch):
            outputs.extend(acoustic.run_batch(audios[off : off + batch]))
        elapsed = time.perf_counter() - started
        if baseline is None:
            baseline = outputs
        difference = max(
            float(np.max(np.abs(a[1] - b[1]))) for a, b in zip(outputs, baseline)
        )
        report = {
            "batchSize": batch,
            "files": len(audios),
            "seconds": elapsed,
            "filesPerSecond": len(audios) / elapsed,
            "maxHiddenDifferenceFromBatch1": difference,
            "driverAllocatedGB": torch.mps.driver_allocated_memory() / 1e9
            if acoustic.device == "mps"
            else None,
        }
        reports.append(report)
        print(json.dumps(report), flush=True)
    selected = max(reports, key=lambda r: r["filesPerSecond"])
    write_json(
        args.output,
        {
            "device": acoustic.device,
            "threads": 16,
            "recommendedGpuGB": torch.mps.recommended_max_memory() / 1e9
            if acoustic.device == "mps"
            else None,
            "comparisonCodeSha256": digest(ROOT / "training/comparison.py"),
            "benchmarkCodeSha256": digest(ROOT / "training/benchmark.py"),
            "inputCorpus": "reference-v1",
            "inputTakeIds": [t["takeId"] for t in takes],
            "results": reports,
            "selectedBatchSize": selected["batchSize"],
            "speedupVsBatch1": selected["filesPerSecond"]
            / reports[0]["filesPerSecond"],
            "note": "Same 64 recordings and phoneme encoder. Padding uses attention masks and exact per-sample convolution output lengths.",
        },
    )


if __name__ == "__main__":
    main()
