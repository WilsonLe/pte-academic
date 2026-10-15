"""Explicit public-weight setup; runtime prediction uses local files only."""

from huggingface_hub import snapshot_download, HfApi
from safetensors.torch import save_file
import torch
from comparison import ENCODERS, DATA, write_json

for kind, (repo, revision) in ENCODERS.items():
    output = DATA / "encoders" / repo.split("/")[-1]
    files = HfApi().list_repo_files(repo, revision=revision)
    weight = (
        "model.safetensors" if "model.safetensors" in files else "pytorch_model.bin"
    )
    snapshot_download(
        repo,
        revision=revision,
        local_dir=output,
        allow_patterns=["*.json", weight, "README.md"],
    )
    if weight.endswith(".bin") and not (output / "model.safetensors").exists():
        state = torch.load(output / weight, map_location="cpu", weights_only=True)
        save_file(
            {k: v.contiguous() for k, v in state.items()},
            str(output / "model.safetensors"),
            metadata={"format": "pt"},
        )
    write_json(
        output / "download-provenance.json",
        {
            "repository": repo,
            "revision": revision,
            "sourceWeight": weight,
            "localSafetensorsConversion": weight.endswith(".bin"),
        },
    )
    print(f"{kind}: pinned {revision}, available locally", flush=True)
