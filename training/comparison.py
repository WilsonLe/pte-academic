"""Local research pronunciation comparison. No provider calls or learner uploads.

The acoustic models are frozen. A projection/classifier is trained on reference
phone segments; reference distributions and separate calibration determine scores.
"""

from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
import cmudict
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import torch
from torch import nn
from torch.nn import functional as F
from transformers import Wav2Vec2ForCTC, Wav2Vec2FeatureExtractor, Wav2Vec2CTCTokenizer

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "artifacts/pronunciation"
CORPUS = DATA / "reference-v1"
ENCODERS = {
    "phones": (
        "facebook/wav2vec2-xlsr-53-espeak-cv-ft",
        "2c733782da5604684829819a5eb744c193fe9398",
    ),
    "words": (
        "facebook/wav2vec2-base-960h",
        "22aad52d435eb6dbaf354bdad9b0da84ce7d6156",
    ),
}
ARP_IPA = dict(
    zip(
        "AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH".split(),
        "ɑː æ ʌ ɔː aʊ aɪ b tʃ d ð ɛ ɚ eɪ f ɡ h ɪ iː dʒ k l m n ŋ oʊ ɔɪ p ɹ s ʃ t θ ʊ uː v w j z ʒ".split(),
    )
)
LEXICON = cmudict.dict()
ONSETS = {
    tuple(p[: next(i for i, t in enumerate(p) if t[-1:].isdigit())])
    for variants in LEXICON.values()
    for p in variants
    if any(t[-1:].isdigit() for t in p)
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    temp.replace(path)


def tokenize(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def pronunciation(word):
    variants = LEXICON.get(word)
    if word in {"footbridge", "whiteboard"}:
        left, right = {
            "footbridge": ("foot", "bridge"),
            "whiteboard": ("white", "board"),
        }[word]
        return LEXICON[left][0] + [p.replace("1", "2") for p in LEXICON[right][0]]
    if not variants:
        return None
    return variants[0]


def syllabify(phones):
    """Lexicon-based maximal-onset syllables, preserving every phone once."""
    nuclei = [i for i, p in enumerate(phones) if p[-1:].isdigit()]
    if not nuclei:
        return []
    cuts = [0]
    for left, right in zip(nuclei, nuclei[1:]):
        cut = right
        for start in range(left + 1, right + 1):
            if tuple(phones[start:right]) in ONSETS:
                cut = start
                break
        cuts.append(cut)
    cuts.append(len(phones))
    return [list(range(a, b)) for a, b in zip(cuts, cuts[1:])]


def ipa(phone):
    if phone == "AH0":
        return "ə"
    return ARP_IPA[re.sub(r"\d", "", phone)]


def script_units(text):
    phones, syllables, unknown = [], [], []
    for wi, word in enumerate(tokenize(text)):
        pron = pronunciation(word)
        if pron is None:
            unknown.append(
                {"word": word, "wordIndex": wi, "status": "unsupported-word"}
            )
            continue
        offset = len(phones)
        for si, indexes in enumerate(syllabify(pron)):
            selected = [pron[i] for i in indexes]
            syllables.append(
                {
                    "word": word,
                    "wordIndex": wi,
                    "syllableIndex": si,
                    "phonemes": selected,
                    "phoneIndexes": [offset + i for i in indexes],
                    "stress": max(int(p[-1]) for p in selected if p[-1:].isdigit()),
                }
            )
        phones.extend(pron)
    return phones, syllables, unknown


def load_audio(path):
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)
    if not np.isfinite(audio).all() or not len(audio):
        raise ValueError("Audio is empty or non-finite.")
    if sr != 16000:
        common = math.gcd(sr, 16000)
        audio = resample_poly(audio, 16000 // common, sr // common).astype(np.float32)
    if len(audio) > 16000 * 125:
        raise ValueError("Audio exceeds the 125-second limit.")
    return audio


def signal_valid(audio):
    if len(audio) < 1600:
        return False
    rms = float(np.sqrt(np.mean(audio**2)))
    if rms < 1e-5:
        return False
    # Reject broadband noise before a recognizer can hallucinate text.
    frames = audio[: len(audio) // 400 * 400].reshape(-1, 400)
    spec = np.abs(np.fft.rfft(frames * np.hanning(400), axis=1)) ** 2 + 1e-12
    flatness = np.exp(np.mean(np.log(spec), axis=1)) / np.mean(spec, axis=1)
    return bool(np.median(flatness) < 0.35)


def ctc_align(log_probs, targets, blank=0):
    """Viterbi alignment with blank, stay, advance and legal repeat skipping."""
    t_count, _ = log_probs.shape
    if not targets or t_count < len(targets) + sum(
        a == b for a, b in zip(targets, targets[1:])
    ):
        raise ValueError("Not enough frames for target sequence.")
    labels = np.full(2 * len(targets) + 1, blank, dtype=np.int64)
    labels[1::2] = targets
    size = len(labels)
    skip = np.zeros(size, bool)
    skip[2:] = (labels[2:] != blank) & (labels[2:] != labels[:-2])
    scores = np.full(size, -np.inf, np.float32)
    scores[0] = log_probs[0, blank]
    scores[1] = log_probs[0, targets[0]]
    back = np.zeros((t_count, size), np.int8)
    for t in range(1, t_count):
        advance = np.r_[-np.inf, scores[:-1]]
        jump = np.r_[-np.inf, -np.inf, scores[:-2]]
        jump[~skip] = -np.inf
        choices = np.stack([scores, advance, jump])
        best = choices.argmax(axis=0)
        scores = choices[best, np.arange(size)] + log_probs[t, labels]
        back[t] = best
    state = size - 1 if scores[-1] > scores[-2] else size - 2
    if not np.isfinite(scores[state]):
        raise ValueError("No valid alignment.")
    states = np.empty(t_count, np.int32)
    for t in range(t_count - 1, -1, -1):
        states[t] = state
        state -= int(back[t, state])
    spans = []
    for i, token in enumerate(targets):
        indexes = np.flatnonzero(states == 2 * i + 1)
        if not len(indexes):
            raise ValueError("Target has no aligned frames.")
        spans.append(
            (
                int(indexes[0]),
                int(indexes[-1]) + 1,
                float(np.exp(log_probs[indexes, token].mean())),
            )
        )
    return spans


def phone_intervals(spans, frame_count):
    """Estimate intervals around CTC peaks; keep long pauses outside segments."""
    bounds = []
    for i, (a, b, _) in enumerate(spans):
        left = max(0, a - 2) if i == 0 else max(a - 4, (spans[i - 1][1] + a) // 2)
        right = (
            min(frame_count, b + 2)
            if i + 1 == len(spans)
            else min(b + 4, (b + spans[i + 1][0]) // 2)
        )
        bounds.append((left, max(left + 1, right)))
    return bounds


class Acoustic:
    def __init__(self, kind="phones", device="auto"):
        repo, self.revision = ENCODERS[kind]
        path = DATA / "encoders" / repo.split("/")[-1]
        self.path, self.kind = path, kind
        self.device = (
            "mps"
            if device == "auto" and torch.backends.mps.is_available()
            else ("cpu" if device == "auto" else device)
        )
        self.extractor = Wav2Vec2FeatureExtractor.from_pretrained(
            path, local_files_only=True
        )
        self.model = (
            Wav2Vec2ForCTC.from_pretrained(
                path, local_files_only=True, use_safetensors=True
            )
            .eval()
            .to(self.device)
        )
        self.vocab = json.loads((path / "vocab.json").read_text())
        self.inverse = {v: k for k, v in self.vocab.items()}
        self.tokenizer = (
            Wav2Vec2CTCTokenizer.from_pretrained(path, local_files_only=True)
            if kind == "words"
            else None
        )

    def run(self, audio):
        values = self.extractor(
            audio, sampling_rate=16000, return_tensors="pt"
        ).input_values.to(self.device)
        with torch.inference_mode():
            result = self.model(values, output_hidden_states=self.kind == "phones")
        logs = result.logits[0].log_softmax(-1).cpu().numpy()
        hidden = (
            result.hidden_states[7][0].cpu().numpy() if self.kind == "phones" else None
        )
        return logs, hidden

    def transcribe(self, audio):
        logs, _ = self.run(audio)
        return self.tokenizer.decode(logs.argmax(-1)).lower().strip()

    def extract(self, audio, text):
        phones, syllables, unknown = script_units(text)
        # Do not align through missing words: that would shift every later segment.
        if unknown:
            raise ValueError(
                "Unsupported words: " + ", ".join(u["word"] for u in unknown)
            )
        if not phones:
            raise ValueError("No supported syllables.")
        logs, hidden = self.run(audio)
        targets = [self.vocab[ipa(p)] for p in phones]
        spans = ctc_align(logs, targets)
        scale = len(audio) / 16000 / len(logs)
        records, features = [], []
        intervals = phone_intervals(spans, len(logs))
        for i, (phone, (a, b, conf)) in enumerate(zip(phones, spans)):
            features.append(hidden[a:b].mean(0))
            records.append(
                {
                    "phone": phone,
                    "ipa": ipa(phone),
                    "start": intervals[i][0] * scale,
                    "end": intervals[i][1] * scale,
                    "alignmentConfidence": conf,
                    "left": phones[i - 1] if i else "#",
                    "right": phones[i + 1] if i + 1 < len(phones) else "#",
                }
            )
        for syllable in syllables:
            ps = [records[i] for i in syllable["phoneIndexes"]]
            syllable.update(
                start=ps[0]["start"],
                end=ps[-1]["end"],
                alignmentConfidence=float(
                    np.mean([p["alignmentConfidence"] for p in ps])
                ),
            )
        return np.array(features, dtype=np.float32), records, syllables


def syllable_features(audio, x, syllables):
    """Contextual sound features plus relative timing/energy/pitch for stress."""
    raw = []
    for s in syllables:
        clip = audio[max(0, int(s["start"] * 16000)) : max(1, int(s["end"] * 16000))]
        duration = max(0.01, len(clip) / 16000)
        energy = math.log(float(np.mean(clip**2)) + 1e-10) if len(clip) else -23.0
        pitches = []
        for start in range(0, max(0, len(clip) - 640), 320):
            frame = clip[start : start + 640]
            frame = frame - frame.mean()
            corr = np.correlate(frame, frame, "full")[len(frame) - 1 :]
            if corr[0] > 1e-6:
                lag = 45 + int(np.argmax(corr[45:267]))
                if corr[lag] / corr[0] > 0.35:
                    pitches.append(math.log(16000 / lag))
        raw.append(
            [math.log(duration), energy, float(np.median(pitches)) if pitches else 0.0]
        )
    raw = np.array(raw, dtype=np.float32)
    result = []
    for i, s in enumerate(syllables):
        word_ids = [
            j for j, t in enumerate(syllables) if t["wordIndex"] == s["wordIndex"]
        ]
        relative = raw[i] - raw[word_ids].mean(0)
        voiced_pitch = [raw[j, 2] for j in word_ids if raw[j, 2] > 0]
        relative[2] = (
            raw[i, 2] - float(np.mean(voiced_pitch))
            if raw[i, 2] > 0 and voiced_pitch
            else 0.0
        )
        s["wordSyllables"] = len(word_ids)
        result.append(np.r_[x[s["phoneIndexes"]].mean(0), relative])
    return np.asarray(result, dtype=np.float32)


class StressHead(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 64), nn.GELU(), nn.Linear(64, 2)
        )

    def forward(self, x):
        return self.network(x)


class ComparisonHead(nn.Module):
    def __init__(self, input_dim=1024, embedding_dim=64, classes=39):
        super().__init__()
        self.project = nn.Sequential(
            nn.Linear(input_dim, 128), nn.GELU(), nn.Linear(128, embedding_dim)
        )
        self.classifier = nn.Linear(embedding_dim, classes)

    def forward(self, x):
        z = F.normalize(self.project(x), dim=-1)
        return z, self.classifier(z)


def reference_stream(initial, follow, expected):
    pending = list(initial)
    seen = set()
    while True:
        for take in pending:
            if take["takeId"] not in seen:
                seen.add(take["takeId"])
                yield take
        if not follow or len(seen) >= expected:
            return
        lock = ROOT / ".cli/openrouter/generation.lock"
        try:
            pid = int(lock.read_text())
            os.kill(pid, 0)
        except (FileNotFoundError, ProcessLookupError, ValueError):
            raise RuntimeError(
                "Reference generation is no longer live and corpus is incomplete."
            )
        time.sleep(3)
        pending = json.loads((CORPUS / "manifest.json").read_text())["takes"]


def prepare(args):
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    config = json.loads((ROOT / "training/reference-corpus.json").read_text())
    takes = manifest["takes"][: args.limit] if args.limit else manifest["takes"]
    if len(manifest["takes"]) < 100:
        raise ValueError(
            "Generate at least 100 verified references before feature preparation."
        )
    output = DATA / "features-v2"
    output.mkdir(parents=True, exist_ok=True)
    acoustic = Acoustic(device=args.device)
    failures = []
    for ti, take in enumerate(
        reference_stream(
            takes, args.follow, len(config["passages"]) * len(config["voices"])
        )
    ):
        out = output / (take["takeId"] + ".npz")
        if out.exists():
            with np.load(out) as cached:
                if (
                    "sx" in cached
                    and str(cached["audio_sha256"]) == take["audioSha256"]
                    and str(cached["encoder_revision"]) == acoustic.revision
                ):
                    continue
            raise ValueError("Stale feature cache: " + str(out))
        path = CORPUS / take["file"]
        if digest(path) != take["audioSha256"]:
            raise ValueError("Audio hash mismatch.")
        try:
            audio = load_audio(path)
            if not signal_valid(audio):
                raise ValueError("Invalid speech signal.")
            x, phones, syllables = acoustic.extract(audio, take["text"])
            sx = syllable_features(audio, x, syllables)
            np.savez_compressed(
                out,
                x=x,
                sx=sx,
                metadata=json.dumps(
                    {"take": take, "phones": phones, "syllables": syllables}
                ),
                audio_sha256=take["audioSha256"],
                encoder_revision=acoustic.revision,
            )
            print(
                json.dumps(
                    {
                        "prepared": ti + 1,
                        "total": len(config["passages"]) * len(config["voices"])
                        if args.follow
                        else len(takes),
                        "take": take["takeId"],
                        "phones": len(phones),
                        "syllables": len(syllables),
                    }
                ),
                flush=True,
            )
        except ValueError as error:
            failures.append({"takeId": take["takeId"], "error": str(error)})
            print(json.dumps(failures[-1]), flush=True)
    write_json(
        output / "preparation.json",
        {
            "failures": failures,
            "encoder": ENCODERS["phones"],
            "count": len(list(output.glob("*.npz"))),
        },
    )


def verified_feature_files():
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    config = json.loads((ROOT / "training/reference-corpus.json").read_text())
    expected = len(config["passages"]) * len(config["voices"])
    if len(manifest["takes"]) != expected:
        raise ValueError(
            "Finish the complete reference generation batch before training."
        )
    audit = json.loads((DATA / "corpus-audit.json").read_text())
    if (
        audit.get("referenceManifestSha256") != digest(CORPUS / "manifest.json")
        or audit["count"] != expected
    ):
        raise ValueError(
            "Finish the current corpus audio/transcript audit before training."
        )
    usable = {t["takeId"] for t in audit["takes"] if t["usable"]}
    result = []
    for take in sorted(manifest["takes"], key=lambda t: t["takeId"]):
        if take["takeId"] not in usable:
            continue
        path = DATA / "features-v2" / (take["takeId"] + ".npz")
        with np.load(path) as cache:
            if (
                str(cache["audio_sha256"]) != take["audioSha256"]
                or str(cache["encoder_revision"]) != ENCODERS["phones"][1]
            ):
                raise ValueError("Feature provenance does not match current corpus.")
        result.append(path)
    if len(result) < 100:
        raise ValueError("Fewer than 100 usable prepared reference recordings.")
    return result


def load_features():
    xs, records = [], []
    for path in verified_feature_files():
        with np.load(path) as cache:
            meta = json.loads(str(cache["metadata"]))
            x = cache["x"]
        start = sum(len(a) for a in xs)
        xs.append(x)
        for i, p in enumerate(meta["phones"]):
            records.append(
                {
                    **p,
                    "takeId": meta["take"]["takeId"],
                    "passageId": meta["take"]["id"],
                    "voice": meta["take"]["voice"],
                    "text": meta["take"]["text"],
                    "index": start + i,
                }
            )
    if not xs:
        raise ValueError("No prepared reference features.")
    return np.concatenate(xs), records


def load_syllable_features():
    xs, records = [], []
    for path in verified_feature_files():
        with np.load(path) as cache:
            meta = json.loads(str(cache["metadata"]))
            sx = cache["sx"]
        xs.append(sx)
        records.extend(
            [
                {**s, "passageId": meta["take"]["id"], "voice": meta["take"]["voice"]}
                for s in meta["syllables"]
            ]
        )
    return np.concatenate(xs), records


def train_stress(seed):
    sx, records = load_syllable_features()
    splits = make_splits(records)
    train = np.array([i for i in splits["train"] if records[i]["wordSyllables"] > 1])
    val = np.array([i for i in splits["validation"] if records[i]["wordSyllables"] > 1])
    mean = sx[train].mean(0)
    std = sx[train].std(0).clip(0.05)
    x = torch.from_numpy((sx - mean) / std)
    y = torch.tensor([int(r["stress"] > 0) for r in records])
    torch.manual_seed(seed)
    head = StressHead(sx.shape[1])
    opt = torch.optim.AdamW(head.parameters(), lr=0.001)
    best = -1
    weights = None
    history = []
    for epoch in range(30):
        head.train()
        for ids in np.array_split(
            train[np.random.permutation(len(train))], max(1, len(train) // 256)
        ):
            loss = F.cross_entropy(head(x[ids]), y[ids])
            opt.zero_grad()
            loss.backward()
            opt.step()
        head.eval()
        with torch.inference_mode():
            acc = float((head(x[val]).argmax(1) == y[val]).float().mean())
        history.append({"epoch": epoch + 1, "validationStressAccuracy": acc})
        if acc > best:
            best = acc
            weights = {k: v.detach().clone() for k, v in head.state_dict().items()}
    return {
        "state_dict": weights,
        "input_dim": sx.shape[1],
        "mean": torch.from_numpy(mean),
        "std": torch.from_numpy(std),
        "bestValidationAccuracy": best,
        "history": history,
    }


def passage_split(passage_id):
    # Stable partition assigned before seeing features or metrics.
    number = int(passage_id.split("-")[-1])
    return "train" if number <= 70 else ("validation" if number <= 85 else "test")


def make_splits(records, held_out="am_puck"):
    out = {
        "train": [],
        "validation": [],
        "voice_validation": [],
        "test": [],
        "voice_test": [],
    }
    for i, r in enumerate(records):
        split = passage_split(r["passageId"])
        if r["voice"] == held_out:
            if split in ("validation", "test"):
                out["voice_" + split].append(i)
        else:
            out[split].append(i)
    return {k: np.array(v, dtype=np.int64) for k, v in out.items()}


def contrastive_loss(z, y, voice, temperature=0.15):
    sim = (z @ z.T) / temperature
    eye = torch.eye(len(z), dtype=torch.bool, device=z.device)
    positive = (y[:, None] == y[None, :]) & (voice[:, None] != voice[None, :]) & ~eye
    sim = sim.masked_fill(eye, -1e4)
    logp = sim - torch.logsumexp(sim, dim=1, keepdim=True)
    count = positive.sum(1)
    valid = count > 0
    return (
        (-(logp * positive).sum(1)[valid] / count[valid]).mean()
        if valid.any()
        else z.sum() * 0
    )


def auc_rank(positive, negative):
    from scipy.stats import rankdata

    if not len(positive) or not len(negative):
        return None
    ranks = rankdata(np.r_[positive, negative])
    return float(
        (ranks[: len(positive)].sum() - len(positive) * (len(positive) + 1) / 2)
        / (len(positive) * len(negative))
    )


def distribution_distances(z, labels, bank):
    result = []
    for v, label in zip(z, labels):
        refs = bank.get(str(label))
        if refs is None:
            result.append(np.nan)
            continue
        # Mean of nearest references supports several valid realizations.
        distances = 1 - v @ refs.T
        result.append(float(np.sort(distances)[: min(8, len(distances))].mean()))
    return np.array(result)


def fit(args):
    torch.set_num_threads(6)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    x, records = load_features()
    splits = make_splits(records)
    classes = sorted(
        {
            r["phone"].rstrip("012")
            for r in records
            if passage_split(r["passageId"]) == "train" and r["voice"] != "am_puck"
        }
    )
    lookup = {p: i for i, p in enumerate(classes)}
    labels = np.array([lookup.get(r["phone"].rstrip("012"), -1) for r in records])
    voices = {v: i for i, v in enumerate(sorted({r["voice"] for r in records}))}
    voice_ids = np.array([voices[r["voice"]] for r in records])
    train = splits["train"]
    val = splits["validation"]
    mean = x[train].mean(0)
    std = x[train].std(0).clip(0.05)
    normalized = (x - mean) / std
    xt = torch.from_numpy(normalized)
    yt = torch.from_numpy(labels)
    vt = torch.from_numpy(voice_ids)
    head = ComparisonHead(x.shape[1], args.embedding_dim, len(classes))
    opt = torch.optim.AdamW(head.parameters(), lr=args.lr, weight_decay=0.01)
    history = []
    best = -1
    best_state = None
    for epoch in range(args.epochs):
        head.train()
        losses = []
        order = train[np.random.permutation(len(train))]
        for off in range(0, len(order), 256):
            ids = order[off : off + 256]
            z, logits = head(xt[ids])
            loss = F.cross_entropy(logits, yt[ids]) + 0.25 * contrastive_loss(
                z, yt[ids], vt[ids]
            )
            opt.zero_grad()
            loss.backward()
            opt.step()
            losses.append(float(loss.detach()))
        head.eval()
        with torch.inference_mode():
            _, logits = head(xt[val])
            acc = float((logits.argmax(1) == yt[val]).float().mean())
        history.append(
            {
                "epoch": epoch + 1,
                "trainLoss": float(np.mean(losses)),
                "validationPhoneAccuracy": acc,
            }
        )
        if acc > best:
            best = acc
            best_state = {k: v.detach().clone() for k, v in head.state_dict().items()}
        if epoch == 0 or (epoch + 1) % 5 == 0:
            print(json.dumps(history[-1]), flush=True)
    head.load_state_dict(best_state)
    head.eval()
    with torch.inference_mode():
        z = head(xt)[0].numpy()
    # A bounded bank per phone preserves voice/context variation; all bank rows are training only.
    rng = np.random.default_rng(args.seed)
    bank = {}
    for label in range(len(classes)):
        ids = train[labels[train] == label]
        bank[str(label)] = z[rng.choice(ids, size=min(len(ids), 256), replace=False)]
    calibration = {}
    # Global acoustic match to native examples is calibrated on separate texts, never test.
    for label in range(len(classes)):
        ids = val[labels[val] == label]
        ds = distribution_distances(z[ids], labels[ids], bank)
        if len(ds) >= 5:
            calibration[str(label)] = [
                float(np.quantile(ds, 0.5)),
                float(np.quantile(ds, 0.95)),
                int(len(ds)),
            ]
    duration = {}
    for p in classes:
        ids = [i for i in train if records[i]["phone"].rstrip("012") == p]
        d = np.log([max(0.01, records[i]["end"] - records[i]["start"]) for i in ids])
        duration[p] = [float(d.mean()), float(max(d.std(), 0.2))]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    stress_model = train_stress(args.seed)
    checkpoint = {
        "stress": stress_model,
        "schemaVersion": 1,
        "state_dict": best_state,
        "input_dim": x.shape[1],
        "embedding_dim": args.embedding_dim,
        "classes": classes,
        "mean": torch.from_numpy(mean),
        "std": torch.from_numpy(std),
        "bank": {k: torch.from_numpy(v) for k, v in bank.items()},
        "calibration": calibration,
        "duration": duration,
        "encoder": ENCODERS["phones"],
        "referenceVersion": "general-american-synthetic-v1",
        "seed": args.seed,
    }
    torch.save(checkpoint, output / "model.pt")
    write_json(
        output / "training.json",
        {
            "seed": args.seed,
            "epochs": args.epochs,
            "lr": args.lr,
            "history": history,
            "bestValidationPhoneAccuracy": best,
            "splitCounts": {k: len(v) for k, v in splits.items()},
            "splitPassages": {
                "train": [f"passage-{i:03d}" for i in range(1, 71)],
                "validation": [f"passage-{i:03d}" for i in range(71, 86)],
                "test": [f"passage-{i:03d}" for i in range(86, 101)],
            },
            "heldOutVoice": "am_puck",
            "referenceManifestSha256": digest(CORPUS / "manifest.json"),
            "modelSha256": digest(output / "model.pt"),
            "classes": classes,
            "trainingRows": len(train),
            "parameters": sum(p.numel() for p in head.parameters()),
            "trainingCodeSha256": digest(Path(__file__)),
            "dependencyLockSha256": digest(ROOT / "training/uv.lock"),
            "stressValidationAccuracy": stress_model["bestValidationAccuracy"],
            "stressHistory": stress_model["history"],
        },
    )
    print(
        json.dumps(
            {"trained": str(output / "model.pt"), "bestValidationPhoneAccuracy": best}
        ),
        flush=True,
    )


def load_checkpoint(path):
    c = torch.load(path, map_location="cpu", weights_only=True)
    head = ComparisonHead(c["input_dim"], c["embedding_dim"], len(c["classes"]))
    head.load_state_dict(c["state_dict"])
    head.eval()
    return c, head


def phone_scores(x, phones, checkpoint, head):
    with torch.inference_mode():
        z = head((torch.from_numpy(x) - checkpoint["mean"]) / checkpoint["std"])[
            0
        ].numpy()
    lookup = {p: i for i, p in enumerate(checkpoint["classes"])}
    bank = {k: v.numpy() for k, v in checkpoint["bank"].items()}
    labels = np.array([lookup.get(p["phone"].rstrip("012"), -1) for p in phones])
    distances = distribution_distances(z, labels, bank)
    result = []
    for p, label, distance in zip(phones, labels, distances):
        cal = checkpoint["calibration"].get(str(label))
        if cal is None or not np.isfinite(distance):
            result.append({**p, "similarity": None, "status": "unsupported-reference"})
            continue
        median, q95, count = cal
        # 85 at held-out median, 60 at held-out q95; an index, not probability.
        score = float(
            np.clip(85 - 25 * (distance - median) / max(q95 - median, 1e-4), 0, 100)
        )
        mu, sigma = checkpoint["duration"][p["phone"].rstrip("012")]
        timing = float(
            np.clip(
                100
                - 15 * abs((math.log(max(0.01, p["end"] - p["start"])) - mu) / sigma),
                0,
                100,
            )
        )
        result.append(
            {
                **p,
                "similarity": round(score, 2),
                "distance": round(float(distance), 5),
                "timingSimilarity": round(timing, 2),
                "status": "scored",
            }
        )
    return result


def predict(args):
    checkpoint, head = load_checkpoint(args.model)
    audio = load_audio(args.audio)
    base = {
        "schemaVersion": 1,
        "referenceVersion": checkpoint["referenceVersion"],
        "modelSha256": digest(args.model),
        "syntheticReference": True,
        "scoreMeaning": "0-100 similarity index to generated American references; not percent correct or a proficiency score",
        "textSource": "expected" if args.text else "recognized",
        "syllables": [],
    }
    if not signal_valid(audio):
        base["status"] = "no-reliable-speech"
        write_json(args.output, base)
        return
    text = args.text or Acoustic("words", args.device).transcribe(audio)
    base["text"] = text
    if not tokenize(text):
        base["status"] = "no-reliable-speech"
        write_json(args.output, base)
        return
    acoustic = Acoustic(device=args.device)
    try:
        x, phones, syllables = acoustic.extract(audio, text)
    except ValueError as e:
        base.update(status="unscored", reason=str(e))
        write_json(args.output, base)
        return
    scored = phone_scores(x, phones, checkpoint, head)
    sx = syllable_features(audio, x, syllables)
    stress = checkpoint["stress"]
    stress_head = StressHead(stress["input_dim"])
    stress_head.load_state_dict(stress["state_dict"])
    stress_head.eval()
    with torch.inference_mode():
        stress_probs = (
            stress_head((torch.from_numpy(sx) - stress["mean"]) / stress["std"])
            .softmax(-1)
            .numpy()
        )
    for si, syllable in enumerate(syllables):
        segments = [scored[i] for i in syllable["phoneIndexes"]]
        values = [p["similarity"] for p in segments if p["similarity"] is not None]
        confidence = float(np.mean([p["alignmentConfidence"] for p in segments]))
        valid = len(values) == len(segments) and confidence >= 0.03
        base["syllables"].append(
            {
                **syllable,
                "label": " ".join(syllable["phonemes"]),
                "similarity": round(float(np.mean(values)), 2) if valid else None,
                "confidence": round(confidence, 3),
                "status": "scored" if valid else "uncertain",
                "soundSimilarity": round(float(np.mean(values)), 2) if values else None,
                "timingSimilarity": round(
                    float(np.mean([p.get("timingSimilarity", 0) for p in segments])), 2
                ),
                "stressSimilarity": round(
                    float(stress_probs[si, int(syllable["stress"] > 0)]) * 100, 2
                )
                if syllable["wordSyllables"] > 1
                else None,
                "stressStatus": "synthetic-reference-model"
                if syllable["wordSyllables"] > 1
                else "single-syllable-word",
                "phones": segments,
            }
        )
    base["status"] = (
        "scored"
        if any(s["status"] == "scored" for s in base["syllables"])
        else "unscored"
    )
    write_json(args.output, base)
    print(
        json.dumps(
            {
                "status": base["status"],
                "syllables": len(base["syllables"]),
                "scored": sum(s["status"] == "scored" for s in base["syllables"]),
                "output": args.output,
            }
        ),
        flush=True,
    )


def evaluate(args):
    c, head = load_checkpoint(args.model)
    x, records = load_features()
    splits = make_splits(records)
    lookup = {p: i for i, p in enumerate(c["classes"])}
    labels = np.array([lookup.get(r["phone"].rstrip("012"), -1) for r in records])
    with torch.inference_mode():
        z, logits = head((torch.from_numpy(x) - c["mean"]) / c["std"])
        z = z.numpy()
        logits = logits.numpy()
    bank = {k: v.numpy() for k, v in c["bank"].items()}
    sx, srecords = load_syllable_features()
    ssplits = make_splits(srecords)
    stress = c["stress"]
    sh = StressHead(stress["input_dim"])
    sh.load_state_dict(stress["state_dict"])
    sh.eval()
    with torch.inference_mode():
        sp = (
            sh((torch.from_numpy(sx) - stress["mean"]) / stress["std"])
            .argmax(1)
            .numpy()
        )
    report = {
        "stressAccuracy": {
            name: float(
                np.mean(
                    sp[[i for i in ids if srecords[i]["wordSyllables"] > 1]]
                    == [
                        int(srecords[i]["stress"] > 0)
                        for i in ids
                        if srecords[i]["wordSyllables"] > 1
                    ]
                )
            )
            for name, ids in ssplits.items()
            if name
            in (
                ["validation", "voice_validation", "test", "voice_test"]
                if args.include_test
                else ["validation", "voice_validation"]
            )
        },
        "modelSha256": digest(args.model),
        "referenceManifestSha256": digest(CORPUS / "manifest.json"),
        "partitions": {},
        "scope": "Synthetic reference generalization and wrong-phone controls. No human learner validation.",
    }
    for name in ["validation", "voice_validation"] + (
        ["test", "voice_test"] if args.include_test else []
    ):
        ids = splits[name]
        ids = ids[labels[ids] >= 0]
        correct = distribution_distances(z[ids], labels[ids], bank)
        # Harder negatives: compare vowel to different vowel, consonant to different consonant.
        vowel = np.array(
            [
                p
                in {
                    "AA",
                    "AE",
                    "AH",
                    "AO",
                    "AW",
                    "AY",
                    "EH",
                    "ER",
                    "EY",
                    "IH",
                    "IY",
                    "OW",
                    "OY",
                    "UH",
                    "UW",
                }
                for p in c["classes"]
            ]
        )
        rng = np.random.default_rng(901)
        wrong = np.array(
            [
                rng.choice(
                    np.flatnonzero(
                        (vowel == vowel[label]) & (np.arange(len(vowel)) != label)
                    )
                )
                for label in labels[ids]
            ]
        )
        mismatch = distribution_distances(z[ids], wrong, bank)
        scores = phone_scores(x[ids], [records[i] for i in ids], c, head)
        values = [s["similarity"] for s in scores if s["similarity"] is not None]
        report["partitions"][name] = {
            "phones": len(ids),
            "phoneClassificationAccuracy": float(
                np.mean(logits[ids].argmax(1) == labels[ids])
            ),
            "correctVsWrongPhoneAuc": auc_rank(-correct, -mismatch),
            "correctDistanceMedian": float(np.median(correct)),
            "wrongDistanceMedian": float(np.median(mismatch)),
            "similarityMedian": float(np.median(values)),
            "supportedScoreFraction": len(values) / len(ids),
            "voices": sorted({records[i]["voice"] for i in ids}),
            "passages": sorted({records[i]["passageId"] for i in ids}),
        }
    write_json(args.output, report)
    print(json.dumps(report, indent=2))


def main():
    torch.set_num_threads(6)
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--limit", type=int)
    prep.add_argument("--follow", action="store_true")
    prep.add_argument("--device", default="auto")
    prep.set_defaults(run=prepare)
    train = sub.add_parser("train")
    train.add_argument("--output", required=True)
    train.add_argument("--epochs", type=int, default=30)
    train.add_argument("--lr", type=float, default=0.001)
    train.add_argument("--seed", type=int, default=20261016)
    train.add_argument("--embedding-dim", type=int, default=64)
    train.set_defaults(run=fit)
    pred = sub.add_parser("predict")
    pred.add_argument("--model", required=True)
    pred.add_argument("--audio", required=True)
    pred.add_argument("--text")
    pred.add_argument("--output", required=True)
    pred.add_argument("--device", default="auto")
    pred.set_defaults(run=predict)
    ev = sub.add_parser("evaluate")
    ev.add_argument("--model", required=True)
    ev.add_argument("--output", required=True)
    ev.add_argument("--include-test", action="store_true")
    ev.set_defaults(run=evaluate)
    args = p.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
