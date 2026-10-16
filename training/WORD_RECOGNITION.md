# Independent word recognition in speaking review

The operator explicitly requested recognition without reference text for all seven speaking types, and accepted the existing synthetic reference bank, labelled Reference pronunciation. Recognition, segmentation, sound grading and the optional prompt diff are distinct stages. No learner audio or derived text leaves the device.

`facebook/wav2vec2-base-960h` revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` is the same frozen public word recognizer already used by the Python pipeline. Its Apache-2.0 weights are exported locally with float16 constants and float32 operations, not newly trained. The derived ~180 MiB encoder is split into <=48 MiB files. Character greedy CTC supplies words, confidence and estimated boundaries from audio alone. It receives no prompt, hotwords or answer key. The four retained accent controls produced identical Python/export transcripts; this is decoder compatibility evidence, not human learner word-error validation. Upstream model card: https://huggingface.co/facebook/wav2vec2-base-960h

A compact 124,082-word pronunciation dictionary contains locally generated US/GB eSpeak phonetic variants for CMUdict spellings and current fixed-question words. CMUdict vocabulary license is bundled. Australian and Indian sounds remain equally accepted by the unchanged v3 acoustic reference bank; dictionaries and the recognizer do not establish equal recognition accuracy across accents. Unsupported phonetics are omitted. Recognized words outside the dictionary, low recognizer confidence (<0.4), failed alignment or uncertain sound evidence receive no invented grade.

The worker recognizes overlapping 20-second regions with one second of context, keeping words by midpoint. Silent window edges are trimmed with 200ms of acoustic context to avoid running attention over long silent tails; timestamps keep their original recording offsets. It releases the recognition session before loading v3. Each word’s audio interval selects phonetic encoder frames for dictionary-based local alignment and the unchanged trained sound projection/reference-bank comparison. Word and syllable timestamps are estimates. Up to 125 seconds is accepted for open speaking tasks; each inference input is <=22 seconds. Legacy expected-text and isolated syllable calls remain bounded to 45 seconds. Cancellation terminates worker ownership; silence/noise checks remain in place. Multiwindow boundaries and difficult learner speech remain evaluation risks.

The independent result adds `recognition: {modelId, words}` to the compatible pronunciation record. Each word has spelling, occurrence index, start/end, confidence and recognized/uncertain/unsupported state. Only the existing IndexedDB queue persists it. An upgrade stores its result separately as `speechAssessment` and leaves `pronunciation` intact; no transcript or grade enters the localStorage index. All speaking types use the same review owner and effort-only retry XP contract. The optional prompt edit-distance diff changes display only; it cannot alter recognised words, times or grades.

The bundled word-audio library derives 998 word entries from retained training examples (no held-out/test voice) and existing original review examples. Each clip retains source take/hash, synthesis/listening status, accent and estimated syllable bounds. Several available accents remain available as source references; the UI selects a matching label/count when possible. These are contextual word excerpts, not new standalone studio takes. Whole-word playback remains available for another pronunciation pattern, but a syllable reference is shown only when its pattern matches the learner’s scored labels. No new audio is synthesized and no paid request is made. The library is smaller than the phonetic dictionary: an absent reference recording is shown explicitly, with learner playback retained. Missing clips never silently substitute a prompt lookup, browser/OS voice or cloud provider. Human listening/learner pronunciation validation is pending; “gold standard” is not claimed.

Rebuild using retained local inputs (explicit public checkpoint setup is described in README):

```sh
HF_HUB_OFFLINE=1 uv run --project training --group export python training/export_recognition.py --data-root /absolute/path/to/artifacts/pronunciation
HF_HUB_OFFLINE=1 uv run --project training --group export python training/export_word_references.py --data-root /absolute/path/to/artifacts/pronunciation
HF_HUB_OFFLINE=1 uv run --project training --group export python training/recognition_cases.py --data-root /absolute/path/to/artifacts/pronunciation
npm run validate:comparison
npm run test:comparison
npm run build
PTE_TEST_PORT=4298 npm run test:comparison:browser -- --grep 'audio-only word recognition|automatic initial feedback'
```

The two exporters write pinned manifests to public and source, with complete hashes, source identities and exporter digests. Run them in that order. Browser controls stay in ignored `artifacts/word-recognition-export/` with distinct `control-` names; reference temporary PCM uses `reference-` names. Raw corpus, Python dependencies, source checkpoint files and credentials remain outside the publish artifact. The additional pack is ~201 MiB; automatic preparation remains in the notification bell. Both packs share the verified scope-specific model cache, separate from the ordinary offline app bundle.

Rollback is reverting the recognition assets and integration; the unchanged v3 bank and original recordings are retained. Older readers ignore additive result fields. No model benchmark, synthetic classification statistic, transcript match or content diff is a validated learner pronunciation/fluency/exam score.
