# Practice home balance — issue #39

The daily panel now keeps its progress, state heading and primary action together. Achievements opens from the panel's top row, removing the isolated trophy row. The bounded panel and larger ring preserve the violet/lime practice design without stretching blank space through the entire workspace. Short windows arrange the ring and heading side by side. All three practice modes still use CardsList; progress remains in the header. The XP explanation opens by click/tap or keyboard in a dismissible popover.

Local Chrome evidence uses synthetic progress, not learner records:

- [Fresh phone](home-balanced-fresh-mobile.png)
- [Completed phone](home-balanced-complete-mobile.png)
- [Desktop](home-balanced-desktop.png)

Verification: `npm run build` passes content/model validation, TypeScript, client artifact and chunk-budget checks. Five focused browser journeys pass with `PTE_TEST_PORT=4198 npx playwright test tests/practice.spec.ts --grep 'daily home groups|simplified workspace fits|daily quest earns real|an empty quest|screen-sized game navigation'`.

The home regression inspects fresh, partial and completed progress at 320×568, 360×640, 390×844, 768×1024 and 1440×900, checks that controls and progress fit the panel, exercises XP help and focus restoration, achievements and completion navigation, and verifies reachable controls at 320px width and heights 400, 451, 500, 540, 560 and 561 through the home scrolling escape and its boundary. Existing journeys cover saved rewards, reload/reset, partial quest resume and reduced motion. An old completion-label assertion was updated to the new visible heading; reward values and behaviour assertions remain intact.

This is local Chrome evidence. Native iOS Safari, full-suite coverage, merge and deployment are not claimed. Product/agent guidance needs no change: existing navigation, practice modes, privacy and reward contracts are preserved. Rollback is a presentation-only revert, with no storage/schema migration.

The single independent review found no actionable PR defects at base `e3cbeefdcaa0fcb233d2014975d8dcd4d8cc27a9` / head `21b0be95723ac930d93790d08f5f51ea9f1ec91c`. It independently exercised navigation/help and inspected the screenshots. It identified pre-existing clipping at 320×500 above the original 450px scrolling threshold. The home-only escape now extends through 560px; other screens retain their existing threshold. The responsible mechanism is the viewport-constrained card combined with its minimum ring/button heights and overflow clipping. Fresh/partial/completed daily states share this layout owner; normal phone/tablet/desktop bounds and the short-height action bounds are covered. No reward, runner, catalogue or storage owner is changed. These subsequent CSS/test fixes are focused-validated, not independently re-reviewed.
