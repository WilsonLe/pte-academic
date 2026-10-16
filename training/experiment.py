"""Versioned corpus paths and data partitions shared by pipeline stages."""

from dataclasses import dataclass
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Experiment:
    path: Path
    config: dict

    @classmethod
    def load(cls, path=None):
        path = Path(path or ROOT / "training/reference-corpus.json").resolve()
        if not path.is_relative_to(ROOT / "training"):
            raise ValueError("Experiment config must be inside training/.")
        config = json.loads(path.read_text())
        for key, default in [
            ("outputDirectory", "reference-v1"),
            ("featureDirectory", "features-v2"),
        ]:
            if not re.fullmatch("[a-z0-9-]+", config.get(key, default)):
                raise ValueError("Unsafe experiment artifact directory.")
        if not re.fullmatch(
            r"[a-z0-9-]+\.json", config.get("auditFile", "corpus-audit.json")
        ):
            raise ValueError("Unsafe experiment audit filename.")
        if config.get("featureRepresentation", "hidden7") not in {
            "hidden7",
            "hidden-ctc-v1",
        }:
            raise ValueError("Unsupported feature representation.")
        return cls(path, config)

    @property
    def base(self):
        return ROOT / "artifacts/pronunciation"

    @property
    def corpus(self):
        return self.base / self.config.get("outputDirectory", "reference-v1")

    @property
    def features(self):
        return self.base / self.config.get("featureDirectory", "features-v2")

    @property
    def audit(self):
        if "auditFile" in self.config:
            return self.base / self.config["auditFile"]
        return self.base / (
            "corpus-audit-v2.json"
            if self.config["schemaVersion"] == 2
            else "corpus-audit.json"
        )

    @property
    def expected(self):
        return len(self.config["passages"]) * len(self.config["voices"])

    @property
    def reference_version(self):
        return self.config["referenceVersion"]

    @property
    def representation(self):
        return self.config.get("featureRepresentation", "hidden7")

    @property
    def phonetic_mode(self):
        return (
            "english-variants" if self.config["schemaVersion"] == 2 else "cmu-american"
        )

    def manifest(self):
        return json.loads((self.corpus / "manifest.json").read_text())
