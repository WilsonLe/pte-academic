# ADR-0001: Use a compact self-trained audio-only recognizer

- Status: accepted
- Date: 2026-10-19
- Owner: PTE Studio maintainer
- Evidence: Operator request to fix recognition issue [150](https://github.com/WilsonLe/pte-academic/issues/150) and run its bounded autopilot playtest; routine implementation choice within that scope, recorded in the issue plan
- Supersedes: none
- Superseded by: none

## Context

Greedy decoding of the frozen base recognizer repeatedly loses clear word endings and produces incorrect spellings. Exact native recordings reproduce these errors independently of prompt text. Capture and direct 16 kHz decoding do not explain them. The original short synthetic clip scripted as “roots” is excluded as a labelled recognition failure: the operator independently hears “roads” or “roods.” A separate fresh native recording is independently labelled “the roots” and remains incorrectly recognised as “the roofs”; keep that residual open.

## Decision

Use frozen `facebook/wav2vec2-large-960h-lv60-self` revision `54074b1c16f4de6a5ad59affb4caa8f2ea03a119`, verified by source weight hash. Export per-channel dynamic INT8 MatMul/Gemm weights, retaining float32 convolution and other operations, and the existing bounded greedy audio-only CTC decoder. Keep20second owned character-recognition spans for at most45seconds of active speech; use10second spans for longer active speech. Both retain1second context on each side (at most22/12seconds). Retain20second owned spans and at most22second context for the independent phonetic grader. The earlier20second recognition candidate exceeded the existing300second production deadline on continuous125second speech, so release requires the shorter-window budget and quality controls to pass. Record encoder hash, upstream revision and decoder/window identity in new assessments. Preserve existing saved results, the v3 phonetic model, reference bank, calibration, pronunciation dictionary and all learner data.

Keep the existing asset directory/cache identity. Each changed encoder file must pass transport and decoded hashes; unchanged phonetic/reference files remain reusable. The recognition session is released before loading the phonetic encoder. No learner audio is uploaded, no prompt enters recognition, and no linguistic match becomes a grade.

## Alternatives

The existing base model with dictionary-aware prefix beam search corrects some boundaries but still loses clear endings and can substitute different valid words. General word-frequency priors can introduce concatenations and require another dataset/license; reject them. A second robust large checkpoint performs worse on the retained diagnostics. Full-precision self-training is larger without a material gain on these controls. Do not retrain on the seven scripts or force output to their text.

## Consequences

The recognition encoder grows from 189,043,500 to 356,158,757 decoded bytes. The compact export retains the improvements on the original recordings, with a small fresh-control difference from full precision. Browser runtime, download size, cancellation, offline behavior and acoustic-grade coverage require actual verification before release. New provenance is optional so older records remain readable; opening an older independent result does not rescore or replace it.

Synthetic script agreement is diagnostic evidence, not a human word-error benchmark or a validated pronunciation score. Ambiguous audio, unfamiliar names, valid spelling variants and residual substitutions remain possible. Unsupported or weak acoustic evidence stays uncertain. See the recognition report and issue for measured results and remaining errors.

## Revisit

Revisit if browser memory/preparation/assessment latency regresses, a representative independently listened human benchmark shows a regression, or a smaller pinned local recognizer demonstrates equal or better outcomes. Such investigation does not authorize cloud recognition, prompt correction or replacing original saved assessments.

Recognition chunks use the versioned `recognizer-lv60-int8-` filename prefix. The shared model-cache identity and unchanged phonetic/dictionary/reference URLs remain stable, while a prepared older tab keeps its original decoded recognizer entries. New preparation must not overwrite those old cache keys. An older tab with an incomplete pack may need an ordinary app update after publication; do not activate one during an attempt.
