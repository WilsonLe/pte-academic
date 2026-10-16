# Blended English synthetic reference comparison v2

A fitted local Python research model that compares syllables with a synthetic reference distribution accepting American, British, Australian and Indian English. It preserves the American-only v1 baseline. It has no human pronunciation-rating validation and is separate from the PTE Studio app.

## Corpus and provenance

5,000 hash-verified, decodable MP3 recordings: 500 distinct passages × ten synthetic profiles, with 1,500 American, 1,500 British, 1,000 Australian and 1,000 Indian examples. Decoded duration is 30,551.128 seconds (8.49 hours). The 500 passages cover 200 topic/scene families: 100 original passages plus 100 new scenes with four framing contexts. These are ten configured synthesis profiles, not ten human participants or certified accent exemplars.

`corpus-summary.json` records complete counts, hashes, budget and provenance. The full manifest and automated audit are losslessly compressed in `reference-manifest.json.gz` and `corpus-audit.json.gz`; `artifact-summary.json` binds uncompressed and compressed hashes. Raw audio remains local in `artifacts/pronunciation/reference-v2/`. The original 400-recording corpus/checkpoint is retained. Exactly 300 matching files were reused; 4,700 new recordings were generated through OpenRouter Kokoro, MAI Voice and MiniMax.

Automated transcript/signal coverage accepted 4,940 recordings and excluded 60: US 5, GB 19, AU 32, IN 4. Rejected recordings remain available with transcripts/reasons; they do not enter fitting or evaluation. The independent ASR coverage threshold is word error ≤25%, not a pronunciation judgment; accent/orthographic and padding sensitivity can affect rejection. All recordings remain pending human listening review.

## Training and split

Source for this fitted candidate: Git commit `f08d072` (full hashes in `training.json` and `artifact-summary.json`). Frozen encoders and dependencies are pinned in `training/README.md` and `training/uv.lock`. v2 uses local US/GB eSpeak phonetic candidates, automatic syllabification and CTC alignment. AU/IN examples broaden the acoustic bank; separate Australian/Indian pronunciation dictionaries are not implemented. Variant choice is made for the complete passage, so mixed within-passage variants may be imperfectly represented.

All versions of a scene family stay in the same text split: 350 training, 75 validation/calibration, 75 final-test passages. Six profiles supply fitted examples: US af_heart/am_michael, GB bf_emma/gb_harry, AU au_isla and IN in_priya. Four profiles are wholly excluded from training and the reference bank: US am_puck, GB bm_george, AU au_bloke and IN in_dhruv. Their training-text recordings are unused. AU's held-out profile also changes synthesis provider, so its result confounds profile/provider generalization with accent coverage.

Actual usable recording counts: training 2,087, validation 447, held-out-profile validation 297, final test 441, held-out-profile final test 292. Other usable recordings are held-out profiles on training texts and remain unused by design.

The comparison head has 143,486 fitted parameters, trained for 30 epochs on 137,967 sound segments. Cross-entropy plus cross-voice supervised contrastive loss fell from 4.8415 to 1.1104. Accent-balanced sampling and bounded, accent-balanced sound-reference banks limit profile-count imbalance. A separately fitted 65,922-parameter stress head uses acoustic features and relative timing/energy/pitch. Best validation sound classification was 94.04%; stress classification was 96.34%.

Candidate selection used validation only. `freeze.json` records identity and known weaknesses before final test evaluation. No model variant was selected against final test results. The nonlinear projection/stress weights were actually optimized; these are not renamed pretrained ASR weights.

## Final synthetic evaluation

| Accent group | Unseen-text sound accuracy, training profiles | Unseen-text sound accuracy, held-out profile | Held-out sound AUROC | Held-out median similarity |
| ------------ | --------------------------------------------: | -------------------------------------------: | -------------------: | -------------------------: |
| en-US        |                                        95.70% |                                       94.71% |               0.9961 |                      84.43 |
| en-GB        |                                        92.92% |                                       93.17% |               0.9952 |                      84.79 |
| en-AU        |                                        93.96% |                                       85.88% |               0.9755 |                      82.34 |
| en-IN        |                                        92.27% |                                       87.65% |               0.9862 |                      82.47 |

Overall sound classification: 93.92% on unseen texts from training profiles and 90.40% on unseen texts from held-out profiles. Sound AUROC: 0.9955 / 0.9890. Stress classification: 96.96% / 95.60%. Per-accent stress, unknown/reference coverage and segment counts are in `final-evaluation.json`.

AUROC compares correctly conditioned sounds with a different vowel (for vowels) or consonant (for consonants). It does not validate subtle within-sound distortions, intelligibility, human scoring accuracy, fluency, or proficiency. Accuracy uses known sound classes; reports retain total and unknown-reference counts and support fractions. Median similarity is partly determined by calibration.

The Australian and Indian held-out groups are weaker. A fast Australian validation sample scored 20/21 syllables with median similarity 56.235 despite passing transcript coverage; its full output is retained in `sample-australian.json`. This exposes sensitivity to voice, reduction, speed and reference/phonetic coverage. Blended references do not guarantee equal behavior for every speaker or accent. Do not use this model for learner judgments without human-speaker validation and calibration.

## Actual local inference

`inference-verification.json` exercises the persisted model with network socket connections denied (observed connections: 0). Expected-text inference scored 21/21 syllables from a held-out US profile; GB/IN samples scored 21/21 and AU 20/21. Audio-only recognition also returned syllables. A fivefold volume reduction changed scores by at most 0.01; silence and white noise returned `no-reliable-speech`. Reloading produced identical results. Actual spoken ship scored 74.69 against ship versus 47.38 against the deliberately substituted sheep target.

Measured expected-text sample latency was 1.53s initially, then roughly 0.29–0.34s for subsequent model-load-and-predict calls in the same process. Audio-only took 0.52s. OS/allocator caches were warm; these are short synthetic samples, not fresh-process startup, browser/mobile latency or general performance guarantees.

Scores are 0–100 reference similarity indexes, not percent correct or probabilities. Validation median distance maps to 85 and 95th-percentile distance to 60. Syllable similarity aggregates sound similarity; stress/timing remain separate. Alignment confidence is separate acoustic evidence, not calibrated correctness probability. Unsupported/uncertain segments retain null main scores; timestamps are automatic estimates. Audio-only inference scores recognized content and cannot prove an intended word was read. The v2 phonetic representation differs from v1, so score/classification numbers are not directly comparable across versions.

## Performance, budget and isolation

On this 18-core / 48 GiB Apple Silicon host, actual 30-epoch comparison plus stress fitting took 41.50s using MPS, batch 2,048 and 16 CPU threads. Generation overlapped GPU features, eight CPU alignment/prosody processes and an eight-thread CPU audit. New recording generation spanned 32.89 minutes, including rate-limit recovery. Public/provider latency remains a bottleneck.

The fixed 64-recording encoder benchmark improved best throughput from 11.25 to 16.70 files/s (1.49×). Current-code batch 1 reached 13.82/s; batch 4 was fastest on that sample. Full corpus preparation used batch 32 for bounded CPU overlap. Stable-run sampled GPU driver allocation was 2.19–3.67 GB; this is not peak physical RAM. Two simultaneous large GPU encoders previously caused shared-memory contention; the final layout separates GPU preparation and CPU ASR. Required-layer capture, padding buckets, bounded work, explicit GPU-buffer release and process-based alignment improved throughput/memory behavior. Native MPEG decoder opening is serialized after reproduced initialization crashes. Full measurements and scope are in `performance.json`.

An unpaced 32-worker AU burst hit HTTP 429 during provider key preflight after 339 successes. All reservations completed, no uncertain paid call existed, and all files were retained. The remaining 161 previously unrequested takes completed with eight workers and four starts/s. There were no automatic paid retries. The generator now includes request pacing and stops scheduling on failures. Stream followers refresh the final manifest before testing generator liveness, covering a completion race found and fixed during this run.

Estimated reference input cost: US$6.1392432. Conservative cumulative project reservations: US$6.3204036 against the unchanged US$10 cap; all 5,136 project reservations completed. The canonical checkout ledger was reconciled without resetting/releasing costs. Provider key usage read back US$0.17573912; this is not proof of settled synthesis charges, so estimates remain reserved. Detailed cost receipts were unavailable for sampled earlier TTS IDs.

No recording/transcript is uploaded during inference. Encoders load strictly from local pinned assets after explicit setup. Raw audio, caches, credentials, Python environment and weights are excluded from the PWA build. This is a reproducible Python research artifact; browser export, app integration, human validation, merge and deployment are outside this change.
