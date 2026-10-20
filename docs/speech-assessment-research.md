# Speech assessment: paused research and next steps

Status: **paused by the operator on 2026-10-20 (Australia/Brisbane)**.
Tracking: [recognition training #154](https://github.com/WilsonLe/pte-academic/issues/154),
[pause and scope](https://github.com/WilsonLe/pte-academic/issues/154#issuecomment-6280718314).
This document records current evidence and an assessment proposal. It does not
authorize another training run or adopt a new grading architecture.

## Where we are

PTE Studio currently recognises words independently from the recording, then uses
the existing v3 acoustic model to compare supported sounds with reference sounds.
Recognition, pronunciation similarity and task content are separate concepts.
Automatic meaning assessment and a validated fluency grader are not implemented.
The v3 similarity index is not a validated learner pronunciation or exam score.

The motivating recording had healthy volume without clipping. A controlled peak
normalisation replay did not change its recognition, word timings or grades.
The runtime already removes the mean and normalises variance in
[`normalizedAudio`](../src/speech/comparison-core.ts). This rules out simple gain
as the demonstrated fix for that recording; it does not rule out every capture
or preprocessing problem on other devices. No speculative denoising or compression
change has been adopted.

The current published architecture remains
[ADR-0001](adr/0001-use-a-compact-self-trained-audio-only-recognizer.md):

- Frozen local wav2vec2 recognition, selected by summed processed audio context:
  LV-60 for 2–45 seconds, original base below 2 or above 45 seconds. This is not
  simply the raw recording duration; trimming and overlapping context matter.
- Audio-only character CTC decoding supplies words, estimated times and confidence.
  Prompt text cannot influence recognition, segmentation or original-result grading.
- Recognised words select pronunciation-dictionary variants for word-local v3
  acoustic comparisons. Unsupported or weak evidence stays uncertain. A prompt
  comparison is a later display operation, not a pronunciation grade.
- Inference stays on the device. Automatic preparation and recovery remain in the
  header notifications. Original recordings, legacy feedback and effort-only XP
  retain their existing contracts.

See [word recognition](../training/WORD_RECOGNITION.md) for exact model identities,
reference-library limitations and browser regeneration details.

## What the new training actually achieved

Issue #154 contains real gradient training, data/provenance audits, quantized
exports and positive **and negative** evaluation results. **No candidate has
passed every promotion gate.** Training success or better human benchmark results
alone have not delivered an acceptable replacement recognizer.

The latest completed experiment, stage ten, increased the training-only retention
coefficient from 0.5 to 2.0. Both declared epochs finished before the predeclared
development-only selection chose epoch one. The actual standard-INT4 export
improved human development macro word-error rate by **18.2933% relative**.

| Exposed regression set | Original errors | Stage-ten errors | Outcome |
| --- | ---: | ---: | --- |
| Human read speech, 4,729 reference words | 636 | 442 | Passed |
| Human conversation, 4,251 reference words | 1,724 | 1,459 | Passed |
| Previously exposed 203 clips, 3,562 reference words | 1,445 | 1,269 | Passed |
| Synthetic clear-speech controls, 1,254 reference words | 21 | 26 | **Failed** |

Errors are substitutions + deletions + insertions, not counts of incorrect clips.
The previous-203 reduction was 12.1799%; its whole-call paired 95% WER-difference
interval was [-0.0658247, -0.0361827]. Synthetic errors by configured voice group
were US 5→7, GB 4→4, AU 6→8 and IN 6→7. These small synthetic groups, including
AU/IN voice overlap, do not establish broad human accent performance.

The unchanged synthetic gate required at most 21 errors; the actual verifier
rejected stage ten. Stages eight and nine also failed that gate (23 and 22 errors).
Do not soften the gate, choose another epoch after exposure, or call these exposed
sets a fresh final test. The same protected 240 recordings have **never been
inferred**. Stage ten has no candidate freeze, learner-recording replay, browser
acceptance, production promotion, merge or deployment.

### Retained evidence and restart location

The separate local `codex/recognition-training` branch is retained at
`37f7263eba11d2458351a294011a8b4b01586777` at this pause. Its worktree is the
`recognition-training` directory under the canonical repository's sibling
`pte-academic.worktrees/`. That local research history is not included in this
documentation change and has not been pushed as a reviewed model-delivery PR.

Within that worktree:

- `training/RECOGNITION_TRAINING.md` describes the full research sequence;
  `training/checkpoints/strong-retention-recognition-stage10/` retains its model
  card, complete cohort reports, source snapshots, protocol and rejection receipt.
- Ignored `artifacts/recognition-training/CURRENT_STATE.md` records the pause and
  precise resume state. Raw corpora, checkpoints, optimizers and teacher targets
  remain local and must be preserved.
- There are uncommitted publication assets from an earlier **rejected** candidate.
  They are not the published baseline or a qualified stage-ten release. Do not
  stage them wholesale, build a release from them or treat an old preview as proof.

Stage-ten identities:

| Artifact | SHA-256 |
| --- | --- |
| Selected raw checkpoint | `d5505e95e85dec081b9b4e0c026311d77d15e7bdf27006df9f13c2792a7eb1a9` |
| Actual 241,236,684-byte encoder | `ad2cc59d9563f0530c866595a263bd8ff8e5756597f9996396105c6663041a0f` |
| Evaluation-pack manifest | `b5ae968ae306f117757f6fda2e69a17038cf0ecc0a205d5fc6f7840b13f936f0` |
| Protected-240 current input manifest | `b0d1327e7ebcf95acdbd716df5e71c165214fc1598ddca2eb90fd1dd99458091` |

No training or evaluation job was running when this pause was recorded. The
[stage-eleven LoRA proposal](https://github.com/WilsonLe/pte-academic/issues/154#issuecomment-6278181294)
was posted, but no LoRA code, preflight or fit has started. It is an untested option,
not the next automatic action. Its idea is to freeze the original recognizer and
fit small low-rank updates, then merge them into an ordinary export. It would still
need the same independent quality, regression and browser gates.

## Proposed assessment responsibilities

The operator proposes different assessment paths for known scripts and open
answers, sharing a transcript-conditioned comparison model where useful. That is
a useful direction to investigate. **Different assessment objectives do not yet
justify seven separately trained model copies.** Start with shared recognition
and acoustic infrastructure, and explicit task-specific content policies. Whether
separate models or shared encoders with different heads work best remains an
experimental decision.

| Responsibility | Evidence needed | Proposed result and boundary |
| --- | --- | --- |
| Recognition: what was said? | Recording; independently listened verbatim labels for evaluation | Words/times plus uncertainty. Never correct output toward the question. |
| Pronunciation: how were the sounds realised? | Recording, hypothesised phones, diverse human pronunciation ratings | Acoustic feedback; a transcript alone cannot establish sound quality. Keep uncertain words unscored. |
| Fluency: how was speech delivered? | Recording and timing, independent human ratings | Separate delivery feedback. Do not turn transcript similarity, raw speed or pauses alone into a validated grade. |
| Content: did the answer address this task? | Recognised meaning plus authored task evidence and rubric | Coverage, relevance and supported factual feedback; accept valid paraphrases and propagate recognition uncertainty. |
| Writing and structured answers | Written response or chosen/ordered values and task rubric/key | Separate text/structured assessment; no speech model required. |

A possible future transcript-conditioned acoustic model could share parameters
across speaking tasks. For an open answer, the recognizer hypothesis could supply
candidate phones to align with the audio. **That does not make the hypothesis a
correct transcript.** If recognition substitutes one word, blindly grading the
recording against that substituted word can penalise correct speech. Retain the
original audio, uncertain alternatives and an abstention path; evaluate recognition
errors and pronunciation errors separately. Never reward text agreeing with itself.

For known scripts, the authored script supplies independent task-content evidence.
For open answers, content must be compared with the task's source/rubric, not with
the generated transcript itself or one model answer. A Describe Image response can
be fluent and clearly spoken yet describe the wrong trend; acoustic similarity
cannot establish that content is correct.

### All seven speaking types

These are proposed practice-feedback contracts, not claims about official scoring.

| Speaking type | Task-content evidence | Proposed content check |
| --- | --- | --- |
| Read Aloud | Authored passage | Coverage, omissions and additions after independent recognition; uncertain recognition remains distinct from confirmed error. |
| Repeat Sentence | Authored source sentence | Retention of the source wording/content after independent recognition. |
| Describe Image | Original image/chart plus authored facts and acceptable observations | Correct entities, values/trends and relationships; accept different valid descriptions. |
| Retell Lecture | Original source material plus authored key points | Accurate coverage and relationships, without invented claims; paraphrases allowed. |
| Answer Short Question | Authored question, answer key and acceptable variants | Whether the brief response answers the question; separate recognition uncertainty from a wrong answer. |
| Summarize Group Discussion | Original discussion, speaker viewpoints and key relationships | Coverage of the discussion and who held each view; accept valid summaries. |
| Respond to a Situation | Original situation, requested action and communication constraints | Relevance, task fulfilment and appropriate communication; no single required script. |

All seven can reuse audio recognition and acoustic evidence while applying these
different content policies. That does **not** imply one model can grade most of
the app's 22 question types. Reading/listening selections and ordering use their
structured keys; written summaries and essays need their own text/rubric pathway.

## What should happen next, after resuming

1. **Settle the assessment contract first.** Choose a small pilot covering a
   known-script task and an open task. Define each feedback dimension, its input,
   uncertainty/abstention behavior and example correct/incorrect cases. Record an
   architecture decision before changing current grading boundaries. This proposal
   does not supersede ADR-0001 or authorize prompt-guided original acoustic grades.
2. **Audit suitable labelled evidence.** Recognition needs verbatim speech labels;
   pronunciation and fluency need independent human ratings; meaning needs authored
   source/rubric facts and human-rated answers, including valid paraphrases and
   fluent-but-wrong content. Split speakers, texts and task/source families before
   fitting. Synthetic reference agreement cannot validate human assessment. Do not
   put learner recordings or labels into fitting, teacher targets or model selection.
3. **Resume recognition only with a finite predeclared experiment.** Reconcile the
   retained worktree and exact source first. Decide whether the unimplemented LoRA
   option addresses the observed retention failure before any new fit. Keep the
   exposed regression gates and report every cohort. Only a qualifying fixed
   export may open the same protected240 once, with original and candidate on the
   identical inputs: at least 10% relative improvement and whole-call paired
   interval upper bound below zero. Failure means no promotion or test-driven retry.
4. **Evaluate assessment dimensions independently.** Plan a shared acoustic scorer
   and task-specific meaning baseline against the pilot labels before deciding on
   separate models/heads. Include clear correct speech, mispronunciation, wrong
   content, silence, noisy speech and wrong recognizer hypotheses. Check human
   agreement, accent/subgroup failures and uncertainty handling. No metric or
   threshold is validated merely by documenting this proposal.
5. **Integrate only qualified components.** Preserve originals and store any new
   versioned assessment separately. Verify the actual quantized worker in the
   built-in browser: prompt independence, native capture/codec, word details and
   playback, offline/integrity retry, cancellation, reload and zero passive XP.
   Retain the 125-second input/300-second processing limits, client-only privacy,
   pinned assets, static site below 1 GB and JavaScript chunk budget below 500 kB.
   Local semantic-model feasibility is unproven; this proposal adds no cloud fallback.
6. **Complete a reviewed delivery before release.** A successful training checkpoint
   is only one step. Export reproducibility, focused source/runtime checks, a linked
   draft PR and one independent review remain necessary. Full merge checks and
   merge/deployment require their own authority. Keep #154 open until its actual
   better-recognizer outcome is delivered; this documentation does not close it.

Until the operator resumes research, preserve the paused artifacts and published
baseline. No new training, synthesis, provider spend or model release follows from
this handoff.
