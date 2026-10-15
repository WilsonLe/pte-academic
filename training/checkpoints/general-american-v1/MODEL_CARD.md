# General American synthetic reference comparison v1

A trained local research model for syllable-level pronunciation similarity to this experiment's generated American English reference corpus. The model is ready for local Python inference. It has no human-speaker validation and is not integrated into the practice app.

## Artifacts and identity

- `model.pt`: actual fitted comparison head, fitted stress head, training feature normalization, sound-conditioned reference bank, calibration and duration distributions. SHA-256: `41a51dc6ccb421c62bf01c5b0c2a9fdfa2a865a968bf3a1eb717c69bc1ba5a50`.
- `reference-manifest.json`: 400 OpenRouter-generated recordings, 100 distinct original passages, four American Kokoro voices, script/audio hashes, generation-header IDs and provenance. Local MP3s: `artifacts/pronunciation/reference-v1/`.
- `corpus-audit.json`: all 400 recordings decoded and passed automated transcript coverage. Median recognition word error: 0. Decoded total: 2,485.129 seconds (41.42 minutes). Native file-container duration estimates total 2,508.216 seconds; decoder timing is used for inference.
- Reference manifest SHA-256: `a2394fa5e3ee9d480def2063b47abdfad5b572a4497a8efe80325b97888c514d`.
- `training.json`: actual fitting history, split IDs, reference hash and source/dependency hashes. Comparison head: 141,991 trainable parameters, plus a separately fitted stress head. Acoustic encoders are frozen and downloaded separately at pinned revisions; see `training/README.md`.
- `sample-syllables.json` and `sample-audio-only.json`: actual persisted output from the held-out voice on validation passage 083, including 23 syllables with sound, stress and timing evidence.

## Training and evaluation

100 passages were assigned to training (70), validation/calibration (15), and final test (15) before fitting. `af_heart`, `af_bella`, and `am_michael` supplied training examples. `am_puck` was entirely excluded from training and the reference bank. Its validation and final-test passages measure held-out synthetic-voice generalization. These are four synthetic voice profiles, not four human participants.

The comparison head trained for 30 epochs on 14,226 sound segments. Cross-entropy plus cross-voice contrastive training loss fell from 4.0443 to 0.6377. Candidate selection used validation sound classification; no model variant was selected against the final test set. The separate stress model trained on syllables from words with several syllables. Sound and stress labels come from the pronunciation lexicon and alignment, not human pronunciation ratings.

| Measurement                                          | Unseen text, training voices | Unseen text, held-out voice |
| ---------------------------------------------------- | ---------------------------: | --------------------------: |
| Sound classification accuracy                        |                       95.96% |                      94.09% |
| Correct vs different same-category sound AUROC       |                       0.9965 |                      0.9944 |
| Stress classification accuracy                       |                       95.04% |                      94.05% |
| Sound segments with supported similarity calibration |                       99.90% |                      99.90% |
| Median sound reference similarity                    |                        85.08 |                       84.01 |

The final test contains 3,048 sound segments from training voices and 1,016 from the held-out voice. AUROC compares matched sounds with a different vowel (for vowels) or consonant (for consonants). It does **not** measure detection of subtle distortions within the same sound or accuracy of human pronunciation judgments. High sound-class discrimination is not pronunciation-scoring accuracy. Median similarity is partly defined by the chosen calibration scale.

## Local inference evidence

`inference-verification.json` records tests through the saved-model local-audio prediction path:

- Expected-text inference scored 23 of 23 syllables from a held-out synthetic voice.
- Audio-only inference recognized the passage and returned syllable results.
- A fivefold volume reduction changed similarity by at most 0.01 points.
- Silence and white noise returned `no-reliable-speech`.
- Reloading the checkpoint produced identical syllable results.
- Network connections during all inference checks: zero; socket connections were denied by the test.
- The same spoken `ship` syllable scored 85.46 against `ship` and 56.97 against the deliberately substituted target `sheep`.

These are synthetic and constructed controls. They do not substitute for consented human learner recordings, manually checked boundaries, accent coverage, or listening judgments.

## Score contract and limits

The main syllable similarity aggregates its sound reference similarities. Sound distance is computed in the learned projection against nearby training exemplars of that sound. Calibration uses separate validation passages: index 85 at median distance and 60 at the 95th percentile, with a small numerical floor. Scores are 0–100 reference similarity indexes, not percentages correct, native-speaker probabilities, intelligibility, proficiency or exam scores.

Stress evidence and timing differences are returned separately; neither is silently folded into the main score. Alignment confidence reflects acoustic alignment, not a calibrated correctness probability. Sparse reference coverage and uncertain alignment return null scores. Syllable and sound boundaries are automatic estimates. Unknown words cause an unscored result rather than allowing alignment to drift through missing dictionary entries. Audio-only inference scores recognized content and cannot prove an intended passage was read correctly.

The reference is the selected synthetic generators/voices. Similarity to a synthetic reference does not establish similarity to every American speaker or make every accent difference an error. The acoustic feature representation still contains context and speaker information; the cross-voice split measures only limited synthetic generalization. Sound-level comparison currently conditions on sound identity with context carried in encoder features, rather than requiring an exact match of every neighboring sound and lexical stress class. Genuine learner-error calibration, native human evaluation and articulatory advice are not validated.

All reference takes remain explicitly marked **pending human listening review**. Training authorization was supplied by the operator; this card makes no blanket claim about other models' output rights. `budget.json` records the unchanged US$10 cap, the conservative cumulative reservation of US$0.1994256, and provider readback limits. Detailed TTS generation-cost lookup returned 404 for sampled generation-header IDs, so estimates remain reserved; no paid retries were made.

This is a research artifact with a reproducible pipeline, not a released browser pronunciation feature. No browser export, mobile performance, app integration, merge or deployment is claimed.
