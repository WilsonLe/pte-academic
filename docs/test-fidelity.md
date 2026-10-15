# Test simulation contract

The learning interface uses the default shadcn preset. The test runner has a separate, restrained exam layout: white workspace, teal navigation bands, recording status and progress, task instructions, appropriate response controls and a forward-only Next button.

## Implemented
- All 22 task types and their response input families: spoken recording; extended text; dictation; single choice; multiple choice; dropdown gaps; word-bank gaps; typed gaps; reordering; selectable incorrect words.
- Item preparation and response periods; wall-clock section deadlines; automatic progression at writing/section expiry.
- Single-play prompt audio with a visible recovery action when browser autoplay is blocked. Audio load failure is explicit.
- Microphone/headphone preflight; one recording per item; tone where applicable; a local RMS approximation of the short-speaking silence cutoff.
- Writing word counts, local cut/copy/paste controls, accessible keyboard alternatives to word/paragraph dragging.
- Full 65-question form and complete section practice; no review hints during an active attempt.
- Review keys, transcripts, examples and local item-credit explanations. Speaking has opt-in on-device transcripts and word-match feedback for fixed-word tasks; open speaking and extended writing retain self-review without a proficiency score.

## Limits to preserve in product copy
- Exact pixel, interaction and accessibility parity with proprietary live-test software has not been established. Do not describe this as an exact replica.
- The static starter content is original. Audio is synthetic, with some shorter prompts. The group-discussion take identifies speakers with one narrator rather than three distinct voices.
- One mock is shared with drills and section practice. Repeated attempts are not unseen forms.
- Check-in, unscored introduction, test-centre software, certified scoring, accommodations and identification procedures are not simulated.
- Recognition word match measures transcript/reference agreement, not pronunciation, accent or fluency. Open speaking has no fabricated semantic score. The small English model can mishear speech and hallucinate from noise.
- Local transcription requires a roughly 60 MB first download and sufficient memory; later offline reuse depends on caches. Inference is only available after an attempt and can be cancelled.
- A local sound threshold is sensitive to microphones and background noise. It cannot replicate an undisclosed speech detector.
- App timing/media checks use real browser APIs with controlled synthetic devices and accelerated clocks where documented. They are distinct from a human completing a timed exam or reviewing audio pronunciation.

No official test material, screenshots, branding or outgoing material links are included, as requested by the operator.
