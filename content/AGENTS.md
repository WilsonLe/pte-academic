# Content authoring contract

Read the root AGENTS.md, then `agents/content-author.md` and `agents/question-reviewer.md`. Agents edit JSON through Git; no live CMS or runtime content generation exists.

## Files and schemas

- `guides.json`: one guide for each of the 22 supported types. Include understandable instructions, timings, skills, at least three practical tips, one pitfall, review criteria and an honest verification date.
- `questions.json`: unique stable IDs, an existing `type`, original title/prompt, explanation and task-specific fields. Add enough original context to assess the intended skill. Do not manufacture variants by changing only a title.
- `mock-tests.json`: ordered, explicit question IDs, at least 65 distinct items and all 22 types. Match the published practice blueprint; do not silently pad a form with duplicates. Each new complete mock needs its own set of original items if it is advertised as unseen.
- `sections.json`: learner descriptions and section time limits.
- `learn.json`: beginner explanations, preparation, privacy and simulation limitations. No assumed PTE knowledge.
- `narration.json`: authoring provenance per audio file: script/audio hashes, measured duration, provider/model/voice, synthetic disclosure and listening-review status. Never include credentials or account details.
- `authoring.json`: authorized provider and total spending policy; changing the cap requires operator approval.

## Question contracts

- `speak`, `write`, `dictation`: `model` contains a valid example or explicitly labelled key-point outline. An outline is not a full essay. Models for written/spoken summaries must match the word limits when represented as model responses.
- `single`, `multi`: options plus stringified zero-based answer indices. A multi-answer task has at least two correct answers; incorrect choices should be plausible but clearly unsupported.
- `dropdown`: text uses `{{}}` gaps, with one `blankOptions` list and one answer for each gap.
- `bank`: text uses `{{}}`, shared `options` contains all correct answers plus distractors. A word can be used once.
- `blanks`: audio plus matching transcript with `{{}}` for missing words; answers match the exact spoken forms and spelling.
- `order`: options are scrambled paragraphs; answers contain each zero-based index once in the coherent order. Explain the links, not just the final order.
- `highlight`: text tokenized on whitespace; answers are string indices of words that differ from the audio. Punctuation remains attached to its word.
- Audio prompts: keep the full original `audioText` for review and authoring. Add `segments` for three-speaker discussions. Runtime hides transcripts until review; source files and compiled answer keys are public static content.
- Charts: title, equal-length labels/values, units, and an accurate model description. Charts use original practice data.

## Required checks

1. Write or revise the original question, model, explanation and guidance together.
2. Check the answer independently. For selected answers, explain why each distractor fails. For open responses, confirm all main points are supported.
3. Run `npm run validate:content` and `npm run test:content`. Missing assets, broken references and mismatched hashes block builds.
4. If a script changes, regenerate its audio through the authorized development CLI. A previous recording with a new transcript is invalid. Paid generation stays within the currently operator-authorized cumulative cap in `authoring.json`; see audio-author instructions.
5. Measure and listen to the new take. Record actual review status; never mark it listened based on file existence or a successful API response. Match duration to the intended task or document the shorter-practice limitation.
6. Preview the affected task and review flow. Confirm answers and transcripts are absent during an attempt.
7. Commit source JSON and referenced media together. Submit for review; do not publish automatically.

The starter bank contains 65 original questions and one shared mock. Drills and section practice intentionally reuse those questions. One narrator currently identifies the three discussion speakers; do not advertise distinct voices. Human listening review remains explicit in the narration manifest.

## Speech comparison coverage

Read Aloud text and Repeat Sentence audioText are bound to the required v3 browser pronunciation candidates. When either changes or a new item is added, rebuild its candidates with `uv run --project training --group export python training/export_browser.py`, then run `npm run validate:comparison` and the affected local/browser grading checks. Both static build paths validate model file hashes and every current fixed-word speech script. Curly apostrophes are normalized as contractions in the browser export. Do not change the accepted checkpoint, reset budgets or synthesize new training data just to update a script; preserve source/model/export provenance and rebuild/test any derived pack deliberately. Other question scoring and learner data privacy remain unchanged.
