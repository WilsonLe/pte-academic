# American English pronunciation comparison experiment

This development-only pipeline generates synthetic American English reference speech through OpenRouter, trains a local comparison model, and returns a reference similarity index for every supported syllable in a local recording. It is separate from PTE Studio's learner-facing Whisper review. Nothing in this directory is imported by the PWA.

The operator authorized generated-output training. The existing US$10 **total project** authoring budget still applies. The corpus generator reads the existing private credential internally and shares the authoring lock and conservative spending ledger. Never reset the ledger, automatically retry a failed paid request, or put a credential in a command argument.

## Reference recordings

`reference-corpus.json` owns 100 original passages and four American English Kokoro voices: `af_heart`, `af_bella`, `am_michael`, and `am_puck`. Generation targets 400 distinct passage/voice recordings through the OpenRouter speech endpoint. This is synthetic reference speech, not recordings of four human speakers.

```sh
npm ci
node scripts/reference-corpus.mjs plan
node scripts/reference-corpus.mjs generate --confirm-spend --max-usd 0.10
```

Review the current estimate before generation. The batch ceiling never overrides the cumulative cap. Completed matching takes are retained and their hashes checked. Unknown/failed requests retain reservations and block resumption pending provider/ledger reconciliation. Saved files have a synthetic flag, model, voice, generation receipt, script/audio hashes, measured duration and truthful listening status. A successful decoder or recognizer check is not human listening review.

Local audio and provenance are under `artifacts/pronunciation/reference-v1/`. All large working artifacts are ignored by Git and excluded from the static build. Preserve this folder if retiring the worktree.

## Local environment and training

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/). Dependency versions and transitive packages are pinned in `uv.lock`. This run uses Apple Silicon locally; CUDA/MPS is not required for the small trained heads.

```sh
uv sync --project training
uv run --project training python training/download_models.py
uv run --project training python training/comparison.py prepare
uv run --project training python training/audit_corpus.py
uv run --project training python training/comparison.py train --output artifacts/pronunciation/runs/candidate-1 --epochs 30
uv run --project training python training/comparison.py evaluate --model artifacts/pronunciation/runs/candidate-1/model.pt --output artifacts/pronunciation/runs/candidate-1/validation.json
```

Model setup explicitly downloads pinned public weights once. Feature preparation and the corpus audit optionally accept `--follow` while the paid generator is demonstrably live. Training requires the complete corpus and matching completed audit. Audit rejects undecodable/non-speech audio and excludes takes with recognition word error over 25%; this threshold is an automated label-coverage guard, not a pronunciation judgment. The audit stores the recognized text for inspection.

The frozen acoustic encoder is [`facebook/wav2vec2-xlsr-53-espeak-cv-ft`](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft), revision `2c733782da5604684829819a5eb744c193fe9398`. [`facebook/wav2vec2-base-960h`](https://huggingface.co/facebook/wav2vec2-base-960h), revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156`, supplies independent transcription and optional audio-only word recognition. Setup converts the phoneme model's original PyTorch state dictionary to safetensors locally. No remote model code is executed.

A CMU pronunciation lexicon supplies sound identities and lexical stress. A maximal-onset syllabifier partitions words; CTC Viterbi alignment estimates sound times, including repeated sounds separated by blanks. English compound entries for `footbridge` and `whiteboard` combine existing lexicon pronunciations explicitly. Unsupported words cause an unscored result rather than shifting later boundaries.

The comparison head is an actual learned nonlinear projection, optimized using sound classification plus cross-voice supervised contrastive loss. Its reference bank contains training sound embeddings only. It preserves several realizations per sound instead of collapsing all examples to one ideal voice. A separate learned stress head uses syllable acoustic features and word-relative duration, energy and pitch. Timing comparisons use training sound-duration distributions.

The stable split is assigned before training:

- Passages 001–070, three voices: training.
- Passages 071–085, those same voices: calibration/model selection.
- Passages 086–100, those same voices: final unseen-text test.
- `am_puck` is excluded from training and the reference bank. Its validation/test passages measure generalization to a held-out synthetic voice.

Training records epochs, losses, model selection, split IDs, dependency/source hashes, reference manifest hash and checkpoint hash. Calibration maps reference distances to a 0–100 similarity index: 85 at a sound's held-out median distance, 60 at its held-out 95th percentile. These choices define an experimental index; they are not probabilities or percent correct. Sparse sound calibration returns an unsupported result. Do not tune models against final test results.

Freeze a candidate after validation, then run `evaluate --include-test` once for final test evidence. Keep unsuccessful runs and their validation metrics so model selection remains inspectable.

## Predict from a local recording

```sh
uv run --project training python training/comparison.py predict \
  --model training/checkpoints/general-american-v1/model.pt \
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

The experiment tests synthetic unseen-text/voice generalization, sound discrimination, stress classification and actual local inference. A native-reference distance is not established merely by successfully transcribing the words. Decoder quality, timing boundaries, recognition errors and reference coverage affect results.

Synthetic positives establish the chosen generators' reference distribution. They cannot establish human American English pronunciation validity, intelligibility, proficiency, or certified exam scores. Human listening review of references and a separate consented human-speaker evaluation remain necessary before learner-facing diagnostic claims. Similarity to this corpus can change with context and is not evidence that every accent difference is an error. The prototype does not validate mouth/tongue correction advice.

The trained model is a Python research artifact. No browser export, mobile performance claim, practice-screen integration, merge or deployment is included. The pinned pretrained encoders are larger than the trained comparison heads; model setup downloads them separately. See the checked-in model card/evidence for the actual completed run and measured limitations.
