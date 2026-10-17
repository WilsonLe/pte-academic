# Playtest

Use this workflow when asked to “playtest”, run a “playtest session”, or play the app as a student and suggest improvements. The outcome is evidence of real learner friction and a short, prioritized improvement report. When implementation is also requested, fix the agreed problems and playtest the resulting candidate again.

## Start in the app

1. Read the current [project instructions](../AGENTS.md). Reuse the user's scope, supplied route and settled preferences. Default to a beginner who knows nothing about PTE: discover what to do through the interface before inspecting implementation or answer keys.
2. Open or select the app in the **visible built-in browser** and inspect its actual state. Use browser controls and screenshots to interact with it. Source inspection and automated tests supplement this walkthrough. If the built-in browser is unavailable, report that blocker and any separate evidence; do not claim a browser playtest from code inspection.
3. Record the URL, revision/worktree, preview mode, viewport and starting learner state. Verify which checkout the server serves. For a changed candidate, use its built static preview following the [build/hosting instructions](../README.md#build-and-host). Automated checks use their own isolated ports and profiles as described in [Commands](../AGENTS.md#commands).
4. Preserve existing sessions, recordings and progress. Ordinary playtesting authorizes saving a practice attempt through normal controls. Use an isolated profile for seeded fixtures or destructive/reset cases. Keep recordings on device and follow the project's privacy and authoring boundaries; playtesting needs no paid content generation.

## Play as a beginner

Complete at least one coherent journey: choose practice, understand preflight, start, answer, finish, inspect Feedback, then reopen the saved session from History. Include a deliberate mistake or skip so feedback has something useful to explain. Do not expose hints or keys during an active attempt. Check reload recovery outside a live attempt; leaving or refreshing the runner ends it.

Explore related surfaces within scope: daily practice, question types, sections, mocks, Instructions, Learn, progress and achievements. Check how a learner returns and what state survives. A general session can sample these paths; a request covering “all” or “every” needs an inventory of affected types, response kinds, modes and shared surfaces, with a result or explicit gap for each. Use the [review audit](../docs/review-audit.md) and [UI coverage audit](../docs/ui-cleanup-coverage.md) as starting maps, then verify against the current app.

Try desktop and a narrow mobile viewport, keyboard navigation, a long prompt/response and a short window where relevant. Read every affected page, open and dismiss detail controls, and check focus returns. Verify complete text, readable controls, correct Question/Feedback counters and reachable actions. Respect contained scrolling and the measured-page rules in the project instructions. Restore temporary viewport changes at the end.

For speaking, exercise playback, preparation/error states and available review/retry controls. State whether evidence came from an actual recording/inference, a synthetic microphone or a controlled saved assessment. Fixture rendering cannot establish recognition or pronunciation quality; preserve uncertainty and the [scoring limitations](../docs/test-fidelity.md).

## Judge improvements by learner purpose

- Identify what the student is trying to do, what blocked or confused them, and why the existing screen failed. Distinguish observed behavior from a hypothesis or personal preference.
- Prefer removing duplication, correcting labels, regrouping controls or reusing existing components. Keep the primary task obvious. Do not add new learning content, default tips, banners or repeated explanations to solve interface friction unless specifically requested.
- Put necessary supporting detail behind a clear click/selection, tooltip or existing disclosure. Keep it discoverable and keyboard accessible. Show complete detail when opened; hiding or clipping essential instructions/answers is not a clutter fix.
- Make feedback local to the response: clickable red/green differences for objective answers, with labels or other non-color cues and explanations on selection. Reorder explanations must explain why each paragraph belongs first/last and how it connects to both available neighbors. Keep writing alternatives/planning outlines neutral and speech's acoustic uncertainty intact. Apply a requested feedback pattern across every affected question type without inventing unsupported correctness or scores.

## Record findings

Keep a compact report in the session; retain larger screenshots/logs in the existing ignored `artifacts/` area. Commit curated evidence only when needed for an authorized change. Record enough surrounding screen context to show the problem, without exposing private learner material.

For each finding, capture:

- **Priority and location:** learner impact, screen/route, mode and question/type if relevant.
- **Reproduce:** starting state and the exact actions taken.
- **Observed vs expected:** what happened and what the student needed; attach evidence when useful.
- **Smallest useful improvement:** intended behavior, what stays hidden until requested, and how to verify success.

Finish with the prioritized findings, coverage/revision and any untested paths or blockers. A clean session reports what was exercised and what remains unknown. Do not present suggestions as implemented or automated checks as manual observations.

## Implement and playtest again when requested

A plain playtest ends with findings. “Implement these improvements and playtest again” authorizes the implementation loop within that scope; carry forward settled decisions without another routine confirmation. Follow the [repository change rules](../AGENTS.md#content-and-product-boundaries): issue before edits, isolated feature branch, focused checks, linked draft PR and one independent review. Read [content instructions](../content/AGENTS.md) before any authored-content edits.

Translate each accepted finding into an observable acceptance check, update the existing owner, and keep the default screen compact. Reopen the **built-in browser** on the resulting candidate and repeat the original failing actions plus affected neighboring paths. For a pattern-wide change, reconcile the inventory rather than stopping at the first working question. Compare before/after results and report remaining issues. Run focused regression checks for the changed behavior; the full repository suite belongs to an authorized merge stage.

Reconfirm the served revision before retesting. A cached PWA can keep showing an older shell even after rebuilding or stopping a server. Check server identity and the app's update state before classifying a regression; use the explicit update/reload flow outside an active attempt. Preserve learner/model storage. If setup, model preparation or browser access blocks progress, record the failing step and last verified state, continue independent checks, and resume from that checkpoint after recovery.

End with findings resolved/open, exact candidate and evidence, validation limits and any draft PR links. Leave a useful app view open. Merge and deployment need their own authority for the named change; approval for an earlier playtest's PRs does not authorize later ones.
