# Recognition investigation: issue 150

The original learner friction was incorrect word recognition and broken word boundaries in otherwise complete synthetic speaking recordings. The recordings passed through the native browser MediaRecorder codec and the actual independent worker. Fixing recognition changes the words selected for subsequent acoustic grading; it does not change the accepted v3 acoustic model, reference bank, calibration or original saved grades.

## Evidence and selection

Compare the exact app-native decoded PCM, with unchanged silence trimming and overlapping windows. Diagnostic inputs were fixed before candidate evaluation: seven original Samantha en-US recordings, four retained accent controls, and 32 new generic clips in four macOS voices (Samantha, Daniel, Karen, Rishi). No prompt, script, hotword, answer key or phonetic grade enters recognition. Scripts only support the diagnostic comparison afterward. The failed Aman synthesis was excluded by a duration sanity check before model evaluation.

The operator independently listened to the short original clip scripted as “The roots” and heard “roads” or “roods.” Exclude that clip from the original error total: its script is not an independent acoustic label. Do not force its output to “roots.” The operator later independently labelled fresh native-codec Clip A as “the roots” and Clip B as “ice.” These are separate recordings; keep their labels and failures distinct from the ambiguous original clip.

| Fixed diagnostic group                          | Current base | Self-training float32 | Compact self-training INT8 | Robust large float32 |
| ----------------------------------------------- | -----------: | --------------------: | -------------------------: | -------------------: |
| Six original clips, 233 normalized script words |     16 edits |                     3 |                          3 |                    9 |
| Four retained accent controls, 64 words         |            0 |                     0 |                          0 |                    0 |
| 32 fresh clips, 216 words                       |           37 |                    10 |                         11 |                   25 |

These counts measure agreement with synthetic scripts, **not human word-error rate or pronunciation validity**. Normalize case/punctuation and equivalent `per cent`/`percent`, `to morrow`/`tomorrow`, `dead line`/`deadline` forms consistently. Keep proper names and other substantive substitutions in the count. The fresh controls are diagnostic, not an untouched external benchmark.

The selected compact frozen recognizer corrects the retained `closes`, `strengthens`, `bus`, `retrieval`, `retention`, `across`, `another` and `attendance` discrepancies. The original Describe Image still has `ot` for `at`; Group Discussion still has `examperia` for `exam period`. Some unfamiliar names and word boundaries remain imperfect. Unsupported spellings remain unscored rather than receiving a prompt-derived grade. These residuals remain tracked by issue150; this change does not claim perfect recognition or close a human validation gap.

Dictionary prefix beams and word-frequency priors were also investigated. They improve some boundaries but can choose different valid words or concatenate unknown speech. Retain the audio-only greedy decoder. Direct 16 kHz browser decoding did not resolve the reported errors. The larger robust checkpoint underperformed the self-training checkpoint. See [ADR-0001](adr/0001-use-a-compact-self-trained-audio-only-recognizer.md).

## Reproducible assets and local controls

[The selected public model](https://huggingface.co/facebook/wav2vec2-large-960h-lv60-self) is pinned at revision `54074b1c16f4de6a5ad59affb4caa8f2ea03a119`, source weight SHA256 `00b604cf4d28e86559e8adaeb3a186daa89dc37f5ab216771a0a15a26db0de9f`. No fitting or provider request is involved. The decoded INT8 ONNX SHA256 is `aa3100a81bc45df0277f2b724227aa4f7c5fd812a44e69f64954734ce870608d`. Independent probe and final exporter produced the same hash.

The recognition pack grows from 211,357,419 to 378,472,676 decoded bytes, and from 176,928,715 to 319,662,045 transfer bytes. Only the changed recognizer chunks need replacement in an existing verified model cache. The unchanged phonetic pack and word references retain their hashes/cache identity. New assessments save exact recognizer/decoder provenance; older assessments remain intact.

Source checkpoints, raw voices, captured recordings and diagnostic logits remain in ignored local artifacts. Four exact native-codec regression PCM fixtures are prepared from retained captures with:

```sh
python3 training/recognition_regressions.py --capture-root /absolute/path/to/retained/native-pcm
PTE_TEST_PORT=4298 npm run test:comparison:browser -- --grep 'recognition retains clear endings|audio-only word recognition is prompt-independent'
```

The fixture preparer verifies fixed PCM hashes. Browser regressions require corrected words, reject the previous substantive errors, assert actual scored acoustic coverage, valid timing/schema and exact provenance. The ordinary comparison fixtures and four accent controls are prepared as described in [WORD_RECOGNITION.md](../training/WORD_RECOGNITION.md). A retained-data fixture is a local test prerequisite; the suite must fail clearly when it is absent. Do not upload recordings to satisfy it.

## New playtest finding

Fresh randomized Read Aloud06 with Daniel exposed [issue152](https://github.com/WilsonLe/pte-academic/issues/152): “judgment” was labelled “instead of judgement.” [Cambridge lists both spellings](https://dictionary.cambridge.org/dictionary/english/judgment). The display comparison now treats this explicit singular/plural spelling pair as equivalent, while retaining the recognised spelling, occurrence, timing and acoustic grades. Genuine different words, homophones and misspellings remain distinct. This key is used only in prompt-display alignment; it cannot feed recognition, segmentation, acoustic grading or writing feedback.

Recognition chunks use the versioned `recognizer-lv60-int8-` filename prefix. The shared model-cache identity and unchanged phonetic/dictionary/reference URLs remain stable, while a prepared older tab keeps its original decoded recognizer entries. New preparation must not overwrite those old cache keys. An older tab with an incomplete pack may need an ordinary app update after publication; do not activate one during an attempt.

The static artifact must remain below the [GitHub Pages 1 GB site limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). The static-output contract checks total published bytes in addition to the existing JavaScript chunk budget. Keep older prepared recognizer bytes in their browser cache; bundling both full recognizers would exceed the hosting envelope.

## Fresh seven-type browser pass

All seven fresh recordings used normal runner recording and saving in the visible built-in browser at `http://127.0.0.1:4564`, static candidate, desktop1280×720. Source voices were fed through a development-only audio input harness and the native MediaRecorder codec; actual worker inference produced each saved assessment. This is synthetic microphone evidence, not a human speaker benchmark. Every assessment finished, every feedback and Details page was read, and all original question text was inspected. The Read Aloud spelling fix was then retested on the same saved assessment at390×844, including word playback/dialog, source paging and the ordinary app update. Saved word/grade/timing evidence remained equal within the browser transport's floating-point roundoff (maximum3.6e-15); passive review retained130XP.

| Type / fresh question        | Voice           | Scored syllables | Recognition against the prepared answer                              |
| ---------------------------- | --------------- | ---------------: | -------------------------------------------------------------------- |
| Read Aloud06                 | Daniel, en-GB   |            81/84 | Equivalent judgement/judgment spelling; no substantive mismatch      |
| Repeat Sentence08            | Daniel, en-GB   |            16/16 | All eight words match                                                |
| Describe Image04             | Karen, en-AU    |            76/76 | arts→ats remains unsupported; over all/overall equivalent            |
| Retell Lecture02             | Rishi, en-IN    |            92/94 | Equivalent recognising/recognizing spelling; no substantive mismatch |
| Answer Short Question02      | Daniel, en-GB   |              2/2 | Deliberately unexpected “the roots” recognised “the roofs”           |
| Summarize Group Discussion01 | Karen, en-AU    |            90/93 | attendance→attendants remains; exam period is correct                |
| Respond to Situation01       | Samantha, en-US |            66/66 | All47 words match                                                    |

Whole-source waveform correlation against each captured recording was0.9923–0.9996, with the complete spoken source retained. Setup answers caused by delayed preparation are explicitly excluded from these seven cases, while their saved assessments were also allowed to finish and reviewed. The discussion recording includes a long silent tail,119seconds total; it did not invent words in that tail. The short answer is intentionally unrelated to its question, demonstrating that recognition does not substitute the answer key.

The new independently labelled roots→roofs error persists in both full-precision and compact recognizers. Exact native-PCM probes of added silence and ±10ms input phases did not fix it; the current base instead says “the moofs.” Independent phonetic evidence favours roots over roofs, but is not a validated replacement recognizer or permission to force a word from a prompt. No such correction, short-clip special case or calibration fitting is shipped. This genuine residual remains open in issue150, along with arts/ats, attendance/attendants and the retained ot/examperia cases.

The independently labelled “ice” recording is recognised correctly by the browser candidate but receives0 reference similarity. The exact PCM also receives0 from the original worker and acoustic bank (confidence0.457; candidate0.556). The baseline probe used the original worker bytes with only the asset URL base made explicit for an isolated Blob worker; it did not save a result or award XP. Thus the low similarity predates this recognizer change. A word identity label alone does not certify pronunciation quality or validate that score. Reference/context quality remains an explicit unvalidated acoustic concern; do not claim that clear recognition validates pronunciation feedback, and do not change the accepted acoustic calibration to fit this sample.

Spelling evidence: [before](evidence/recognition-150-spelling-before.png), [after](evidence/recognition-150-spelling-after.png), [mobile](evidence/recognition-150-spelling-mobile.png). The higher XP in later screenshots comes from the intervening saved practices; passive review itself preserved130XP.

## Duration and release gate

The first20second recognition-window candidate exceeded the existing300second worker deadline on continuous125second speech. Ten-second owned recognition spans (up to12seconds with overlap) passed that deadline, but introduced two additional discussion-word errors in a CPU diagnostic replay. The selected adaptive rule therefore keeps20second spans for at most45seconds between the first and last active audio (including context), and uses10second spans only for longer active speech. A silent tail does not force shorter context. This rule examines audio duration only. The phonetic grader retains its original20second spans and up to22second context in both paths. New assessments record `greedy-ctc-adaptive-v1` and `windowSeconds`; retained earlier `greedy-ctc-v1` results remain readable.

The seven saved browser assessments above predate this duration optimization and use20second context. All seven have active speech below45seconds; final candidate worker replays use the exact native PCM as separate evidence, preserving those saved originals. Boundary tests cover single ownership, long active speech, short input and long silence. The dense runtime/coverage test and full repository suite remain release gates on the committed candidate.
