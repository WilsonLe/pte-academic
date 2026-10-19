# Recognition investigation: issue 150

The original learner friction was incorrect word recognition and broken word boundaries in otherwise complete synthetic speaking recordings. The recordings passed through the native browser MediaRecorder codec and the actual independent worker. Fixing recognition changes the words selected for subsequent acoustic grading; it does not change the accepted v3 acoustic model, reference bank, calibration or original saved grades.

## Evidence and selection

Compare the exact app-native decoded PCM, with unchanged silence trimming and overlapping windows. Diagnostic inputs were fixed before candidate evaluation: seven original Samantha en-US recordings, four retained accent controls, and 32 new generic clips in four macOS voices (Samantha, Daniel, Karen, Rishi). No prompt, script, hotword, answer key or phonetic grade enters recognition. Scripts only support the diagnostic comparison afterward. The failed Aman synthesis was excluded by a duration sanity check before model evaluation.

The operator independently listened to the short original clip scripted as “The roots” and heard “roads” or “roods.” Exclude that clip from the original error total: its script is not an independent acoustic label. Do not force its output to “roots.” The operator later independently labelled fresh native-codec Clip A as “the roots” and Clip B as “ice.” These are separate recordings; keep their labels and failures distinct from the ambiguous original clip.

| Fixed diagnostic group                          | Current base | Self-training float32 | Selected weight-only INT4 | Robust large float32 |
| ----------------------------------------------- | -----------: | --------------------: | ------------------------: | -------------------: |
| Six original clips, 233 normalized script words |     16 edits |                     3 |                         3 |                    9 |
| Four retained accent controls, 64 words         |            0 |                     0 |                         0 |                    0 |
| 32 fresh clips, 216 words                       |           37 |                    10 |                         8 |                   25 |

These counts measure agreement with synthetic scripts, **not human word-error rate or pronunciation validity**. Normalize case/punctuation and equivalent `per cent`/`percent`, `to morrow`/`tomorrow`, `dead line`/`deadline` forms consistently. Keep proper names and other substantive substitutions in the count. The fresh controls are diagnostic, not an untouched external benchmark.

The selected compact frozen recognizer corrects the retained `closes`, `strengthens`, `bus`, `retrieval`, `retention`, `across`, `another` and `attendance` discrepancies. The original Describe Image still has `ot` for `at`; Group Discussion still has `examperia` for `exam period`. Some unfamiliar names and word boundaries remain imperfect. Unsupported spellings remain unscored rather than receiving a prompt-derived grade. These residuals remain tracked by issue150; this change does not claim perfect recognition or close a human validation gap.

Dictionary prefix beams and word-frequency priors were also investigated. They improve some boundaries but can choose different valid words or concatenate unknown speech. Retain the audio-only greedy decoder. Direct 16 kHz browser decoding did not resolve the reported errors. The larger robust checkpoint underperformed the self-training checkpoint. See [ADR-0001](adr/0001-use-a-compact-self-trained-audio-only-recognizer.md).

## Reproducible assets and local controls

[The selected public model](https://huggingface.co/facebook/wav2vec2-large-960h-lv60-self) is pinned at revision `54074b1c16f4de6a5ad59affb4caa8f2ea03a119`, source weight SHA256 `00b604cf4d28e86559e8adaeb3a186daa89dc37f5ab216771a0a15a26db0de9f`. No fitting or provider request is involved. The decoded weight-only INT4 ONNX SHA256 is `69df640ba26e45292aaefd6a57d4bea88ab05000fb28ca139478fbbbc035565a`. Independent probe and final exporter produced the same hash.

The recognition pack grows from 211,357,419 to 452,594,103 decoded bytes, and from 176,928,715 to 377,145,008 transfer bytes. The short-response encoder is 241,236,684 bytes. Long responses retain the exact original base encoder,189,043,500 bytes, SHA `b81a5907a87709ff9a83ac87a74473128c76ab3cefa8416bdebd4dbbc1eea931`, derived from the original pinned base checkpoint (`model.safetensors` SHA `8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a`). Its four generic chunk URLs retain their exact compressed bytes. Existing prepared phonetic, base, dictionary and reference files remain reusable; compatible legacy encoder entries are copied into the new encoder cache only after full decoded verification. New assessments save exact recognizer/decoder provenance; older assessments remain intact.

Source checkpoints, raw voices, captured recordings and diagnostic logits remain in ignored local artifacts. Five exact native-codec regression PCM fixtures are prepared from retained captures with:

```sh
python3 training/recognition_regressions.py --capture-root /absolute/path/to/retained/native-pcm
PTE_TEST_PORT=4298 npm run test:comparison:browser -- --grep 'recognition retains clear endings|audio-only word recognition is prompt-independent'
```

The fixture preparer verifies fixed PCM hashes. Browser regressions require corrected words, reject the previous substantive errors, assert actual scored acoustic coverage, valid timing/schema and exact provenance. The ordinary comparison fixtures and four accent controls are prepared as described in [WORD_RECOGNITION.md](../training/WORD_RECOGNITION.md). A retained-data fixture is a local test prerequisite; the suite must fail clearly when it is absent. Do not upload recordings to satisfy it.

## New playtest finding

Fresh randomized Read Aloud06 with Daniel exposed [issue152](https://github.com/WilsonLe/pte-academic/issues/152): “judgment” was labelled “instead of judgement.” [Cambridge lists both spellings](https://dictionary.cambridge.org/dictionary/english/judgment). The display comparison now treats this explicit singular/plural spelling pair as equivalent, while retaining the recognised spelling, occurrence, timing and acoustic grades. Genuine different words, homophones and misspellings remain distinct. This key is used only in prompt-display alignment; it cannot feed recognition, segmentation, acoustic grading or writing feedback.

New short-response chunks use the versioned `recognizer-lv60-int4-` prefix. Each encoder uses an additional cache namespace derived from its pinned SHA. The original cache identity, generic base URLs and unchanged phonetic/dictionary/reference URLs remain stable. Never delete prepared legacy entries or overwrite saved results. The preparer rechecks all required receipts before reporting ready; inference reads still verify decoded hashes. Keep updates manual outside an attempt.

The static artifact must remain below the [GitHub Pages 1 GB site limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Both builds check total published bytes and the existing JavaScript chunk budget. The current artifact is 976,942,567 bytes with the normal publisher and decoded JSON sidecars retained; no publishing exception is needed.

## Initial native-recording pass

All seven fresh recordings used normal runner recording and saving in the visible built-in browser at `http://127.0.0.1:4564`, static candidate, desktop 1280×720. Source voices were fed through a development-only audio input harness and the native MediaRecorder codec; actual worker inference produced each saved assessment. This is synthetic microphone evidence, not a human speaker benchmark. Every assessment finished, every feedback and Details page was read, and all original question text was inspected. The Read Aloud spelling fix was then retested on the same saved assessment at 390×844, including word playback/dialog, source paging and the ordinary app update. Saved word/grade/timing evidence remained equal within the browser transport's floating-point roundoff (maximum 3.6e-15); passive review retained 130XP.

| Type / fresh question        | Voice           | Scored syllables | Recognition against the prepared answer                              |
| ---------------------------- | --------------- | ---------------: | -------------------------------------------------------------------- |
| Read Aloud06                 | Daniel, en-GB   |            81/84 | Equivalent judgement/judgment spelling; no substantive mismatch      |
| Repeat Sentence08            | Daniel, en-GB   |            16/16 | All eight words match                                                |
| Describe Image04             | Karen, en-AU    |            76/76 | arts→ats remains unsupported; over all/overall equivalent            |
| Retell Lecture02             | Rishi, en-IN    |            92/94 | Equivalent recognising/recognizing spelling; no substantive mismatch |
| Answer Short Question02      | Daniel, en-GB   |              2/2 | Deliberately unexpected “the roots” recognised “the roofs”           |
| Summarize Group Discussion01 | Karen, en-AU    |            90/93 | attendance→attendants remains; exam period is correct                |
| Respond to Situation01       | Samantha, en-US |            66/66 | All47 words match                                                    |

Whole-source waveform correlation against each captured recording was 0.9923–0.9996, with the complete spoken source retained. Setup answers caused by delayed preparation are explicitly excluded from these seven cases, while their saved assessments were also allowed to finish and reviewed. The discussion recording includes a long silent tail,119 seconds total; it did not invent words in that tail. The short answer is intentionally unrelated to its question, demonstrating that recognition does not substitute the answer key.

The new independently labelled roots→roofs error persists in both full-precision and compact recognizers. Exact native-PCM probes of added silence and ±10 ms input phases did not fix it; the current base instead says “the moofs.” Independent phonetic evidence favours roots over roofs, but is not a validated replacement recognizer or permission to force a word from a prompt. No such correction, short-clip special case or calibration fitting is shipped. These initial-pass residuals informed final retesting below; issue150 remains open for unresolved recognition and reference-quality limitations.

The independently labelled “ice” recording is recognised correctly by the browser candidate but receives 0 reference similarity. The exact PCM also receives 0 from the original worker and acoustic bank (confidence0.457; candidate 0.556). The baseline probe used the original worker bytes with only the asset URL base made explicit for an isolated Blob worker; it did not save a result or award XP. Thus the low similarity predates this recognizer change. A word identity label alone does not certify pronunciation quality or validate that score. Reference/context quality remains an explicit unvalidated acoustic concern; do not claim that clear recognition validates pronunciation feedback, and do not change the accepted acoustic calibration to fit this sample.

Spelling evidence: [before](evidence/recognition-150-spelling-before.png), [after](evidence/recognition-150-spelling-after.png), [mobile](evidence/recognition-150-spelling-mobile.png). The higher XP in later screenshots comes from the intervening saved practices; passive review itself preserved130XP.

## Duration and release gate

The large-only initial export exceeded the unchanged 300-second production budget on continuous125-second speech. An unchanged-worker diagnostic completed in 344 seconds, including 178 seconds before phonetic grading. Smaller-window and alternative-quantization probes did not provide sufficient measured browser headroom. Do not treat a probe-only extended deadline or a CPU speed gain as a production pass.

The selected worker retains 20-second owned recognition and grading spans, with up to 22-second context. Sum the actual trimmed recognition-window lengths: 2–45 seconds selects the stronger LV-60 weight-only INT4 recognizer; isolated context below 2 seconds and greater cost above 45 seconds select the exact original base encoder. Silence and separated brief speech do not needlessly select weaker recognition. Prompt text and grades never enter this choice. The phonetic model, projection, bank and calibration remain unchanged.

Compact dynamic-quantized base alternatives were rejected: on a64.908-second mixed-four-accent browser control, the original FP16 encoder has 3 script errors, versus 8 for full-range signed INT8 and 5 for reduced-range/unsigned variants. CPU results alone did not establish browser parity. The retained encoder is reproduced byte-for-byte from its pinned public source. Short-response INT4 controls retain3 script edits across the six original unambiguous clips,0 across the four accent controls and 8 across 32 fresh clips (versus 16/0/37 for the production base). Exact native WASM inputs preserve closes/strengthens and correct the fresh Describe Image arts/ats discrepancy. These are synthetic script-agreement diagnostics, not human accuracy or pronunciation validation.

Each new encoder has its own immutable cache namespace. Chromium's [memory-backed cache implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/net/disk_cache/memory/mem_backend_impl.cc) can evict entries under pressure; the fresh prepared caches must each stay below 1 GiB. The original combined cache measured1,169,171,408 bytes. The isolated moderate-pressure probe retained files on this Chromium build, so it is not an eviction reproduction. An intermittent earlier missing-model error remains distinct from that structural risk. Actual missing/corrupt/offline recovery and subsequent inference remain mandatory gates.

New assessments record the selected encoder hash/revision, `greedy-ctc-duration-v1` and `windowSeconds:20`. Earlier provenance remains readable and saved originals are not rescored. The initial seven recordings above remain intact. Final verification uses a separate empty origin with copies of their raw native recordings, empty answer objects and no injected transcript or assessment; the app's normal automatic worker and persistence path must produce the results. An additional independently labelled ice recording is a separate control. The five focused current-candidate browser gates passed: native regressions, continuous speech, sustained four-accent speech, cache retention/offline inference and warm preparation. The continuous125-second control completed in197.717 seconds, within the unchanged300-second application deadline. All-eight automatic assessments completed; the isolated-word compatibility retest below also passed. The full repository suite remains a release gate. The native-regression helper uses the app's300-second per-recognition budget, retaining the 60-second legacy phonetic helper and per-recording result/timing receipts.

## Isolated utterance compatibility

The final automatic eight-recording check caught a regression not covered by the initial four native fixtures: weight-only INT4 recognised the independently labelled “ice” as “i.” Keeping the output projection in float32 and changing block sizes did not restore the word. These probes are excluded as release candidates. Preserve the original base recognizer below 2 seconds of summed, trimmed recognition context, as well as above 45 seconds. The selected stronger recognizer remains responsible for sentence-length responses. This general context policy retains baseline isolated-word behavior; it does not force a word from the prompt, add synthetic silence or fit weights/calibration to the sample.

Add the exact native ice PCM hash to the regression inventory, assert its original recognizer provenance and require “ice” rather than “i” or “is.” All duration boundaries and long-silence/separated-speech behavior have focused contracts. The original final-pass assessment showing “i” remains intact in the isolated profile; two new recording-only fixtures retest roots and ice through the normal app assessment/save path. Original learner attempts remain intact. Do not claim new short-answer accuracy or acoustic validity from this compatibility path.

## Final app reassessment results

The visible built-in browser completed all eight automatic assessments from raw native recordings on an isolated origin, with no injected words, transcripts or grades. The final context policy leaves the six sentence-length types on the same INT4 hash; both isolated short answers were assessed again on new recording-only fixtures using the exact original base hash. The previous results remain intact, including the rejected ice→i result. This is controlled native-recording reassessment through the normal app worker/save path, following the initial seven normal runner journeys; it is not a second fresh runner capture or a human speaker benchmark.

| Type / question              | Final recognition against recording/script                                                                   | Scored syllables |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------: |
| Read Aloud06                 | 55 words; judgment spelling no longer falsely marked                                                         |            81/84 |
| Repeat Sentence08            | All 8 words retained                                                                                         |            16/16 |
| Describe Image04             | 51 words; arts corrected and scored                                                                          |            77/77 |
| Retell Lecture02             | 55 words; recognising/recognizing equivalent                                                                 |            92/94 |
| Answer Short Question02      | Independently labelled roots remains incorrectly moofs on original baseline; unsupported word stays unscored |    1/1 available |
| Summarize Group Discussion01 | 54 words; attendance/attendants residual; no invented silent-tail words                                      |            90/93 |
| Respond to Situation01       | All 47 words retained                                                                                        |            66/66 |
| Additional ice control       | Independently labelled ice recognised completely; original zero-similarity concern retained                  |              1/1 |

Every Feedback and Details page and the complete original source was read. Read Aloud was checked at1280×720 and390×844: complete question paging, contained feedback scrolling, word paging, judgment dialog playback, learner syllable playback and focus return. No false judgment substitution appears. History reopening and reload preserve the new ice assessment and its exact original-model provenance. The isolated profile remains at0XP, with all10 fixtures retained and no practice/retry reward written. Original seven learner attempts and their recordings remain in the separate original origin. No learner data or raw recordings are committed/uploaded.

The five-case native-codec regression passes with actual grading and exact selected-model provenance. The continuous125-second control previously passed in197.717 seconds and the mixed-four-accent control passed its unchanged quality/coverage threshold; both sustained paths retain the same original encoder and will rerun in the full suite. Root build, asset/static contracts and14 focused recognition/storage contracts pass after the compatibility change. One independent review applies to the earlier head documented in the PR; later runtime/export/cache/test gate fixes are validated separately, not claimed independently reviewed.
