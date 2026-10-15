import unittest
import numpy as np
from comparison import (
    ctc_align,
    phone_intervals,
    script_units,
    signal_valid,
    make_splits,
    ComparisonHead,
    contrastive_loss,
    distribution_distances,
    reference_stream,
)
import torch


class ComparisonContracts(unittest.TestCase):
    def test_final_manifest_is_consumed_after_generator_releases_lock(self):
        from types import SimpleNamespace
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from unittest.mock import patch

        first, last = {"takeId": "first"}, {"takeId": "last"}
        experiment = SimpleNamespace(manifest=lambda: {"takes": [first, last]})
        with TemporaryDirectory() as folder, patch("comparison.ROOT", Path(folder)):
            self.assertEqual(
                list(reference_stream([first], True, 2, experiment)), [first, last]
            )
            with self.assertRaisesRegex(RuntimeError, "no longer live"):
                list(reference_stream([first], True, 3, experiment))

    def test_phone_intervals_include_short_gaps_and_exclude_long_pauses(self):
        self.assertEqual(
            phone_intervals([(2, 3, 0.9), (6, 7, 0.9)], 10), [(0, 4), (4, 9)]
        )
        spans = phone_intervals([(2, 3, 0.9), (25, 26, 0.9)], 30)
        self.assertLess(spans[0][1], spans[1][0])

    def test_alignment_repeated_tokens_need_blank(self):
        logs = np.log(
            np.array(
                [
                    [0.05, 0.9, 0.05],
                    [0.9, 0.05, 0.05],
                    [0.05, 0.9, 0.05],
                    [0.9, 0.05, 0.05],
                ],
                dtype=np.float32,
            )
        )
        spans = ctc_align(logs, [1, 1])
        self.assertEqual([(a, b) for a, b, _ in spans], [(0, 1), (2, 3)])
        with self.assertRaises(ValueError):
            ctc_align(logs[:2], [1, 1])

    def test_alignment_different_tokens_skip_blank(self):
        logs = np.log(
            np.array([[0.01, 0.98, 0.01], [0.01, 0.01, 0.98]], dtype=np.float32)
        )
        self.assertEqual(
            [(a, b) for a, b, _ in ctc_align(logs, [1, 2])], [(0, 1), (1, 2)]
        )

    def test_syllable_partition_preserves_sounds_and_stress(self):
        phones, syllables, unknown = script_units("banana development")
        self.assertEqual(unknown, [])
        self.assertEqual(len(syllables), 7)
        self.assertEqual(
            [i for s in syllables for i in s["phoneIndexes"]], list(range(len(phones)))
        )
        self.assertEqual([s["stress"] for s in syllables[:3]], [0, 1, 0])
        self.assertEqual(
            script_units("zzzznonexistent")[2][0]["status"], "unsupported-word"
        )

    def test_split_has_no_held_out_voice_or_test_text_leak(self):
        records = [
            {"passageId": f"passage-{n:03d}", "voice": v}
            for n in [1, 71, 86]
            for v in ["af_heart", "am_puck"]
        ]
        s = make_splits(records)
        self.assertEqual(s["train"].tolist(), [0])
        self.assertEqual(s["validation"].tolist(), [2])
        self.assertEqual(s["test"].tolist(), [4])
        self.assertEqual(s["voice_test"].tolist(), [5])
        self.assertFalse(set(s["train"]) & set(s["test"]))

    def test_silence_and_white_noise_are_unscored(self):
        self.assertFalse(signal_valid(np.zeros(16000, dtype=np.float32)))
        self.assertFalse(
            signal_valid(
                np.random.default_rng(0).normal(0, 0.1, 16000).astype(np.float32)
            )
        )
        speech = (
            np.sin(2 * np.pi * 160 * np.arange(16000) / 16000).astype(np.float32) * 0.1
        )
        self.assertTrue(signal_valid(speech))
        self.assertTrue(signal_valid(speech * 0.2))

    def test_comparison_training_changes_learned_weights(self):
        torch.manual_seed(1)
        head = ComparisonHead(8, 4, 2)
        before = head.project[0].weight.detach().clone()
        x = torch.randn(8, 8)
        y = torch.tensor([0, 0, 0, 0, 1, 1, 1, 1])
        voices = torch.tensor([0, 1, 0, 1, 0, 1, 0, 1])
        z, logits = head(x)
        loss = torch.nn.functional.cross_entropy(logits, y) + contrastive_loss(
            z, y, voices
        )
        loss.backward()
        torch.optim.SGD(head.parameters(), lr=0.1).step()
        self.assertFalse(torch.equal(before, head.project[0].weight))

    def test_reference_comparison_is_phone_conditioned(self):
        bank = {"0": np.array([[1.0, 0.0]]), "1": np.array([[0.0, 1.0]])}
        np.testing.assert_allclose(
            distribution_distances(np.array([[1.0, 0.0], [1.0, 0.0]]), [0, 1], bank),
            [0, 1],
        )

    def test_parallel_native_mp3_decode_is_stable(self):
        from concurrent.futures import ThreadPoolExecutor
        from comparison import ROOT, load_audio

        files = sorted((ROOT / "public/audio").glob("*.mp3"))[:16]
        self.assertEqual(len(files), 16)
        with ThreadPoolExecutor(max_workers=16) as pool:
            audios = list(pool.map(load_audio, files * 4))
        self.assertEqual(len(audios), 64)
        self.assertTrue(all(len(a) > 0 and np.isfinite(a).all() for a in audios))

    def test_english_variants_preserve_nonrhotic_reference(self):
        from phonetics import word_phones

        us = word_phones("garden", "en-us")
        gb = word_phones("garden", "en-gb")
        self.assertTrue(any("ɹ" in p for p in us))
        self.assertFalse(any("ɹ" in p for p in gb))

    def test_explicit_family_partition_overrides_v1_numbering(self):
        records = [
            {
                "passageId": "passage-101",
                "voice": "am_puck",
                "heldOut": False,
                "split": "train",
            },
            {
                "passageId": "passage-102",
                "voice": "new-voice",
                "heldOut": True,
                "split": "validation",
            },
        ]
        s = make_splits(records)
        self.assertEqual(s["train"].tolist(), [0])
        self.assertEqual(s["voice_validation"].tolist(), [1])


if __name__ == "__main__":
    unittest.main()
