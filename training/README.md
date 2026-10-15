# English pronunciation comparison experiment

This development-only pipeline generates synthetic English reference speech through OpenRouter, trains a local comparison model, and returns a reference similarity index for every supported syllable in a local recording. It is separate from PTE Studio's learner-facing Whisper review. Nothing in this directory is imported by the PWA.

The operator authorized generated-output training. The existing US$10 **total project** authoring budget still applies. The corpus generator reads the existing private credential internally and shares the authoring lock and conservative spending ledger. Never reset the ledger, automatically retry a failed paid request, or put a credential in a command argument.

## Reference recordings

The preserved `reference-corpus.json` baseline contains 100 original passages and four American Kokoro profiles (400 recordings). The expanded `reference-corpus-v2.json` contains 500 passages and ten synthetic profiles (5,000 recordings): American, British, Australian and Indian English. All four groups are accepted references for v2; v1 remains an American-only comparison.

The expanded texts comprise the original 100 passages plus 100 new scene families with four framing contexts each. There are 200 topic/scene families, not 500 independent topics. Each family belongs wholly to training, validation or final test. Locale labels describe the configured synthetic voices, not verified human accent membership.

```sh
npm ci
node scripts/reference-corpus.mjs plan --config training/reference-corpus-v2.json
node scripts/reference-corpus.mjs generate --config training/reference-corpus-v2.json --concurrency 16 --requests-per-second 4 --confirm-spend --max-usd 7
```

Review the live estimate first. The batch ceiling never overrides the cumulative US$10 cap. Concurrency accepts 1–32 workers. Request starts are paced at four per second by default (`--requests-per-second`, greater than zero and at most 32); an unpaced 32-worker burst reached a provider preflight rate limit, so higher concurrency alone is not a throughput guarantee. One serialized coordinator reserves budget and checkpoints each manifest/ledger mutation, while independent requests overlap. A failed request stops new scheduling and drains in-flight work. There are no automatic paid retries. Failed/uncertain reservations block resumption until reconciled.

Matching completed takes are hash checked and retained; 300 matching baseline recordings are reused in v2. Files include synthetic flags, model/voice/accent, split/family, generation-header ID, script/audio hashes, duration and truthful listening status. Decoder or recognizer checks do not establish human listening review. Public model availability and prices are verified when planning/generating.

Local audio is under `artifacts/pronunciation/reference-v1/` and `reference-v2/`. Large working artifacts are ignored by Git and excluded from the static build. Preserve these folders when retiring the worktree. Checked-in checkpoints and evidence live under `training/checkpoints/`.

## Local environment and training

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/). Dependency versions and transitive packages are pinned in `uv.lock`. This run uses Apple Silicon locally; CUDA/MPS is not required for the small trained heads.

```sh
uv sync --project training
uv run --project training python training/download_models.py
uv run --project training python training/comparison.py prepare --config training/reference-corpus-v2.json --batch-size 32 --workers 8
uv run --project training python training/audit_corpus.py --config training/reference-corpus-v2.json --batch-size 8 --workers 4 --device cpu --threads 8
uv run --project training python training/comparison.py train --config training/reference-corpus-v2.json --output artifacts/pronunciation/runs/blended-candidate-1 --epochs 30 --device auto --batch-size 2048 --threads 16
uv run --project training python training/comparison.py evaluate --config training/reference-corpus-v2.json --model artifacts/pronunciation/runs/blended-candidate-1/model.pt --output artifacts/pronunciation/runs/blended-candidate-1/validation.json
```

Model setup explicitly downloads pinned public weights once. Feature preparation and the corpus audit optionally accept `--follow` while the paid generator is demonstrably live. Training requires the complete corpus and matching completed audit. Audit rejects undecodable/non-speech audio and excludes takes with recognition word error over 25%; this threshold is an automated label-coverage guard, not a pronunciation judgment. The audit stores the recognized text for inspection.

The frozen acoustic encoder is [`facebook/wav2vec2-xlsr-53-espeak-cv-ft`](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft), revision `2c733782da5604684829819a5eb744c193fe9398`. [`facebook/wav2vec2-base-960h`](https://huggingface.co/facebook/wav2vec2-base-960h), revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156`, supplies independent transcription and optional audio-only word recognition. Setup converts the phoneme model's original PyTorch state dictionary to safetensors locally. No remote model code is executed.

For v1 a CMU pronunciation lexicon supplies sound identities and lexical stress. For v2 local eSpeak-ng supplies US and British pronunciation candidates, including rhotic/nonrhotic variants; the acoustic aligner chooses the better-supported complete candidate. Australian and Indian recordings broaden the acoustic reference bank but do not have separate locale-specific pronunciation dictionaries. eSpeak is used for text-to-phoneme conversion only; reference speech is generated through the configured OpenRouter providers. A maximal-onset syllabifier partitions words; CTC Viterbi alignment estimates sound times, including repeated sounds separated by blanks. English compound entries for `footbridge` and `whiteboard` combine existing lexicon pronunciations explicitly. Unsupported words cause an unscored result rather than shifting later boundaries.

The comparison head is an actual learned nonlinear projection, optimized using sound classification plus cross-voice supervised contrastive loss. Its reference bank contains training sound embeddings only. It preserves several realizations per sound instead of collapsing all examples to one ideal voice. A separate learned stress head uses syllable acoustic features and word-relative duration, energy and pitch. Timing comparisons use training sound-duration distributions.

The stable split is assigned before training:

- v2 has 350 training, 75 validation and 75 test passages, with families kept together.
- Six profiles supply training/calibration/test recordings. Four additional profiles (`am_puck`, `bm_george`, `au_bloke`, `in_dhruv`) are entirely excluded from training and the reference bank, providing one held-out profile per accent group. Only their validation/test passages are evaluated; their training-text recordings are unused.
- Training sampling and the bounded reference bank balance accent groups. Calibration uses only validation passages from training profiles. Evaluation reports each accent separately as well as overall metrics.
- v1 retains its original 70/15/15 passage split, three training profiles and held-out `am_puck`.

Training records epochs, losses, model selection, split IDs, dependency/source hashes, reference manifest hash and checkpoint hash. Calibration maps reference distances to a 0–100 similarity index: 85 at a sound's held-out median distance, 60 at its held-out 95th percentile. These choices define an experimental index; they are not probabilities or percent correct. Sparse sound calibration returns an unsupported result. Do not tune models against final test results.

Freeze a candidate after validation, then run `evaluate --include-test` once for final test evidence. Keep unsuccessful runs and their validation metrics so model selection remains inspectable.

## Resource use

On the 18-core, 48 GiB Apple Silicon host, feature preparation uses one MPS phonetic encoder, eight CPU alignment/prosody processes and a bounded decoder pool. Transcript auditing runs concurrently on CPU with eight Torch threads. Two large MPS encoder processes caused shared-memory contention; splitting GPU preparation from CPU auditing restored throughput. Keeping only the required hidden layer, bucketing padded lengths, releasing GPU tensors and using CPU processes reduces memory pressure. Native libsndfile MP3 opening is serialized because concurrent initialization crashed in `mpeg_init`; resampling and feature work remain parallel.

Use `--follow` on preparation/audit to process incoming generator checkpoints. Each stage resumes completed, hash-verified work. Benchmark GPU batches with `python training/benchmark.py` after preparation finishes; running another large GPU process alongside preparation distorts results. `batch-benchmark.json` and the final model card record measured settings rather than assuming maximum worker count is fastest. CPU training is also supported with `--device cpu`.

## Predict from a local recording

```sh
uv run --project training python training/comparison.py predict \
  --model training/checkpoints/blended-english-v2/model.pt \
  --audio /absolute/path/to/recording.wav \
  --text 'The sentence the learner intended to read.' \
  --output artifacts/pronunciation/prediction.json
```

Omit `--text` for audio-only inference. That path scores the words the recognizer identifies; it cannot establish whether an intended word was read correctly. Model loading during prediction is strictly local (`local_files_only=True`). No recording, transcript or feature is sent to a provider. `HF_HUB_OFFLINE=1` can enforce offline public-model access as well.

Each syllable result includes word/syllable index, phonetic label, start/end seconds, sound similarity, stress evidence for words with several syllables, timing similarity, alignment confidence and status. The main similarity currently aggregates sound similarities; stress and timing remain separate evidence. Alignment confidence is acoustic alignment evidence, not a calibrated probability that the pronunciation is correct. Low-confidence or unsupported segments retain null scores. Silence and broadband noise return no reliable speech. Input duration is limited to 125 seconds.

## Validation and limits

```sh
node --test tests/openrouter.test.mjs tests/reference-corpus.test.mjs
uv run --project training python -m unittest discover -s training -p 'test_*.py' -v
npm run build
```

The experiment tests synthetic unseen-text/voice generalization, sound discrimination, stress classification and actual local inference. A reference distance is not established merely by successfully transcribing the words. Decoder quality, timing boundaries, recognition errors and reference coverage affect results.

Synthetic positives establish the chosen generators' reference distribution. They cannot establish human English pronunciation validity, intelligibility, proficiency, or certified exam scores. Human listening review of references and a separate consented human-speaker evaluation remain necessary before learner-facing diagnostic claims. Similarity to this corpus can change with context and is not evidence that every accent difference is an error. The prototype does not validate mouth/tongue correction advice.

The trained model is a Python research artifact. No browser export, mobile performance claim, practice-screen integration, merge or deployment is included. The pinned pretrained encoders are larger than the trained comparison heads; model setup downloads them separately. See the checked-in model card/evidence for the actual completed run and measured limitations.
