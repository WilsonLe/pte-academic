# ADR-0001: Select compact audio-only recognizers by processed duration

- Status: accepted
- Date: 2026-10-19
- Owner: PTE Studio maintainer
- Evidence: Operator request to fix recognition issue [150](https://github.com/WilsonLe/pte-academic/issues/150) and run its bounded autopilot playtest; routine implementation choice within that scope, recorded in the issue plan
- Supersedes: none
- Superseded by: none

## Context

Greedy decoding of the frozen base recognizer repeatedly loses clear word endings and produces incorrect spellings. Exact native recordings reproduce these errors independently of prompt text. Capture and direct 16 kHz decoding do not explain them. The original short synthetic clip scripted as “roots” is excluded as a labelled recognition failure: the operator independently hears “roads” or “roods.” A separate fresh native recording is independently labelled “the roots” and remains incorrectly recognised as “the roofs”; keep that residual open.

## Decision

Use frozen `facebook/wav2vec2-large-960h-lv60-self` revision `54074b1c16f4de6a5ad59affb4caa8f2ea03a119` for 2–45 seconds of summed, trimmed recognition context. Export symmetric block-32 weight-only INT4 MatMulNBits with float32 activations, convolution and other operations. For isolated context below 2 seconds or greater cost above 45 seconds, retain the exact original `facebook/wav2vec2-base-960h` revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` encoder with float16 constant storage and float32 operations. Pin both public sources/configurations and reproduce the original base hash and compressed chunk bytes. Retain greedy character CTC and 20-second owned spans with at most 22-second context for recognition and phonetic grading. Long silence and separated short speech do not count as expensive processed context. Prompt text and grades never select the model.

A native recording independently labelled “ice” regressed to “i” with weight-only INT4. Changing block sizes or preserving the output projection did not restore it. Preserve the original recognizer for isolated utterances by an audio-only context floor; no prompt, word, score or clip hash selects a model. This retains baseline short-answer behavior rather than claiming its recognition issues are solved.

The earlier large-only export exceeded the300-second deadline on 125-second continuous speech. Alternative compact base exports regressed actual browser recognition on a mixed-accent control despite passing CPU checks; retain the original base output instead. The smaller short-response export preserves the targeted native corrections and improves the wider synthetic controls while fitting the static-hosting budget alongside the original base. Save exact selected-model and decoder provenance. Preserve the v3 phonetic model, reference bank, calibration, dictionary, saved originals and learner data.

Keep v3, references, runtime and existing legacy entries in the original model cache. Each new encoder uses a separate immutable cache namespace derived from its SHA, bounding fresh per-cache size below 1 GiB for memory-backed browsers. Reuse a legacy entry only after a full decoded hash check, and never delete it. Check all required receipts again before reporting ready; missing/corrupt model recovery remains in the header. The recognition session is released before loading the phonetic encoder. No learner audio is uploaded and no linguistic match becomes a grade.

## Alternatives

The existing base model with dictionary-aware prefix beam search corrects some boundaries but still loses clear endings and can substitute different valid words. General word-frequency priors can introduce concatenations and require another dataset/license; reject them. A second robust large checkpoint performs worse on the retained diagnostics. Full-precision self-training is larger without a material gain on these controls. Do not retrain on the seven scripts or force output to their text.

## Consequences

The short-response encoder has 241,236,684 decoded bytes; the exact original long-response encoder has 189,043,500 bytes. The recognition pack transfers 377,145,008 bytes versus 176,928,715 previously. The normal publisher fits the unchanged 1 GB site guard without omitting decoded sidecars. Original generic base URLs remain byte-for-byte compatible. Sustained speech retains the base model's weaker recognition; short responses receive the demonstrated improvement. Browser runtime, download size, cancellation, offline behavior and acoustic-grade coverage require current-candidate verification. Provenance stays optional so older records remain readable; opening an older independent result does not replace it.

Synthetic script agreement is diagnostic evidence, not a human word-error benchmark or a validated pronunciation score. Ambiguous audio, unfamiliar names, valid spelling variants and residual substitutions remain possible. Unsupported or weak acoustic evidence stays uncertain. See the recognition report and issue for measured results and remaining errors.

## Revisit

Revisit if browser memory/preparation/assessment latency regresses, a representative independently listened human benchmark shows a regression, or a smaller pinned local recognizer demonstrates equal or better outcomes. Such investigation does not authorize cloud recognition, prompt correction or replacing original saved assessments.

Short-response chunks use `recognizer-lv60-int4-`; long responses retain the original generic `recognizer-NN.bin` URLs. The shared model-cache identity and unchanged phonetic/dictionary/reference URLs remain stable, while a prepared older tab keeps its original decoded recognizer entries. New preparation must not overwrite those old cache keys. An older tab with an incomplete pack may need an ordinary app update after publication; do not activate one during an attempt.
