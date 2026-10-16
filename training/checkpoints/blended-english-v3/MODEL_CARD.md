# Blended English v3: Australian and Indian generalization improvement

An actual fitted local Python comparison checkpoint, preserving American, British, Australian and Indian English as equally valid references. It improves synthetic sound discrimination and reference generalization over v2 without new paid training examples. It is a research artifact, with no human pronunciation-rating validation or app integration.

## Paired fresh test result

Both checkpoints were evaluated on the same new recordings, phonetic alignments and 60 fresh passage families (501–560), after v3 candidate selection and freeze. These passages never entered training or validation. Previous v2 final-test passages were explicitly moved into development validation because their results had already been observed. The original four held-out profiles remain excluded from fitted weights and the reference bank.

| Held-out accent profile | V2 sound classification | V3 sound classification | Gain, percentage points | Wrong-sound AUROC, v2 → v3 |
| ----------------------- | ----------------------: | ----------------------: | ----------------------: | -------------------------: |
| en-US                   |                  94.61% |                  97.47% |                   +2.86 |            0.9955 → 0.9989 |
| en-GB                   |                  93.89% |                  95.96% |                   +2.06 |            0.9948 → 0.9973 |
| en-AU                   |                  86.15% |                  92.58% |                   +6.43 |            0.9827 → 0.9942 |
| en-IN                   |                  88.94% |                  93.55% |                   +4.61 |            0.9851 → 0.9960 |

Overall held-out-profile fresh-test sound classification: 91.01% → 94.94%. Unseen text from training profiles: 94.30% → 96.40%. All four accent groups improved in both partitions. Wrong-sound discrimination also improved in each group. Full paired numbers, similarity/support fractions and model/manifest identities are in `paired-comparison.json`, with unmodified underlying reports in `baseline-final-evaluation.json` and `final-evaluation.json`.

These are classifications of automatically aligned reference sounds and constructed different-vowel/consonant controls. They are **not** accuracy of human pronunciation scores, intelligibility, native-speaker probabilities, fluency or proficiency. AUROC uses a random different sound of the same vowel/consonant category; it does not establish subtle learner-error detection. No candidate was selected or adjusted using fresh final-test results.

## What changed and why

V2 held-out validation errors included Australian vowel confusions (for example eɪ/aɪ) and Indian consonant/reduced-vowel confusions. Alignment-confidence differences alone did not explain the classification gap; per-phone evidence is retained in `baseline-diagnosis.json`. The library exposes US/GB phonetic candidates, with no separate AU/IN backend. Live provider discovery exposed no additional distinct AU/IN identities; changing the synthesis model for the same named voice is not independent-speaker evidence.

V3's checkpoint-bound `hidden-ctc-v1` representation appends the full observed CTC phonetic log-probability vector to the original intermediate acoustic feature, pooling the same aligned frames. The supplied target phone ID, accent ID and target one-hot label are never appended. Alignment and uncertainty thresholds are unchanged. Preparation and prediction share `sound_feature`; mismatched/unsupported cache representations are rejected. Old checkpoints retain the original `hidden7` path.

Training/reference banks stay balanced by accent. V3 additionally balances stress-training sampling and each phone's common calibration/duration mixture across represented accents. Macro-average validation sound accuracy gives equal selection weight to each accent group. Calibration uses one shared per-phone inverse weighted empirical distribution; it does not apply an offset based on a learner's accent. Changes were evaluated jointly; this run does not independently attribute a separate causal gain to each component.

Transfer evaluation requires explicit `--transfer`, records both training and evaluation manifest hashes, and never updates either model. The legacy hidden7 feature is the unchanged prefix of hidden-ctc-v1; its three relative stress features are preserved separately during conversion. Different phonetic label systems or unsupported conversions fail closed. Both final reports therefore use identical new raw audio/alignments with the feature semantics each checkpoint was trained on.

## Corpus and training identity

5,600 recordings: the previous 5,000 files reused with hashes, plus 600 newly generated final-test files. There are 560 passages and ten synthesis profiles: three US, three GB, two AU, two IN. Training still uses the same 350 passages; development validation has 150 and the fresh final test has 60 independent families. The original 200 topic/scene families plus 60 new families give 260 families overall. The original family variants remain in the same split.

The audit accepted 5,532/5,600 recordings, including cached rows reused only with matching raw hashes. 68 remain excluded with transcripts/reasons. Decoded duration: 34,007.848s (9.45 hours). Raw audio: `artifacts/pronunciation/reference-v3/`. Full manifest/audit are losslessly compressed in this directory; `artifact-summary.json` contains hashes, counts and source identities. All human listening statuses remain pending. ASR word-error coverage is not a pronunciation judgment and can be accent-sensitive.

Actual fitting used 2,087 training recordings / 137,967 sound segments, with 193,662 comparison-head parameters plus the separately learned stress head. Encoder weights/revisions remain frozen; all comparison/stress weights are genuinely optimized locally. The head trained for 30 epochs, with loss 4.7567 → 1.1007. Selected pooled validation accuracy: 95.63%; selection criterion: `macro-accent-validation-accuracy` (95.43%). Stress accuracy/history and all split/family IDs are in `training.json`.

Training implementation is preserved at commit `8827348`; the exact `trainingCodeSha256`, dependency lock and config hashes are recorded. Model SHA-256: `2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b`. `freeze.json` preserves the pre-test checkpoint and validation hashes. The current source snapshot also includes the subsequently authorized budget-policy extension; that extension did not alter fitting or scores.

## Actual inference and compatibility

Offline saved-model checks denied socket connections; observed connections: 0. Expected-text and audio-only paths both returned syllable JSON. V3 scored 21/21 syllables for the US/GB/IN validation samples and 20/21 for AU, preserving its uncertain syllable. A fivefold gain reduction changed similarity by at most 0.01. Silence/noise were rejected; reload produced identical results. Constructed ship/sheep controls gave lower or unsupported scores for the wrong target in US, GB, AU and IN; per-group numbers are in `inference-verification.json`.

Legacy sample checks on the current code preserved 23 v1 and 21 v2 syllables: maximum similarity change was 0.0 / 0.01 on CPU relative to saved outputs, with zero network connections. See `legacy-compatibility.json`. The frozen encoder still requires an explicit one-time pinned local download; inference never uploads recordings/transcripts or silently downloads models.

## Performance and budget

The complete 5,600-file feature rerun took 384.59s (14.56 files/s), using one MPS encoder, batch 16 and eight CPU alignment/prosody workers on the 18-core / 48 GiB host. Transcript auditing ran on CPU with eight Torch threads. Sampled GPU driver allocation ranged 2.19–3.28GB, not a measured peak RAM footprint. Comparison plus stress fitting took 44.84s on MPS, batch 2,048, 16 CPU threads. The 600 new speech calls took 179.12s with paced concurrency; no automatic paid retry occurred.

New v3 reference cost estimate was US$0.6909603, completed inside the original US$10 budget. Cumulative conservative reservations are US$7.0113639, all 5,736 entries completed and preserved in both task/canonical ledgers. The operator then explicitly confirmed a **fresh US$10 allowance from now**, in addition to prior reservations. Current cumulative cap: **US$17.0113639**. No new paid request has consumed that fresh allowance. The provider cap was updated on the existing key, with no periodic reset; credential/key identity and historical usage were retained.

`content/authoring.json` records the explicit authorization and historical cutoff/hash. Both authoring paths validate the unchanged historical prefix and enforce the cumulative cap using the greater of provider usage or reservations. Status reports conservative remaining funds, distinct from provider-only remaining credit. Deleting/truncating/changing earlier reservations or dropping the authorization fails closed. Provider charges may settle later, so estimated reservations are never released solely because reported usage is lower. No new key, cap-evading ledger reset, automatic allowance renewal or paid retry is implemented.

## Limits and use

AU/IN generalization remains weaker than US/GB. The fast AU validation sample's median syllable similarity is 58.695, versus v2's 56.235, and one segment remains uncertain. The improvement does not establish equal behavior for every speaker/accent. Passage-wide US/GB pronunciation variants, automatic boundaries, voice/provider and speed sensitivity remain limitations; AU's held-out profile also changes synthesis provider. Human-native references and consented human learner error/ratings are still needed before diagnostic use.

Scores remain 0–100 reference similarity indexes, not percentages correct. Stress and timing remain separate evidence; alignment confidence is not calibrated correctness probability. Unknown/unreliable segments retain null scores. Audio-only inference scores recognized content and cannot prove an intended word was read. Use `training/README.md` for local setup/CLI commands and select this directory's `model.pt` for v3 prediction.

No app/UI/storage changes or runtime cloud calls are included. Training audio, environments, encoders, credentials and checkpoint files remain outside the PWA build. PR handoff is a research deliverable; merge and deployment are not authorized.
