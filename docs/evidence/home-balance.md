# Practice home balance — issue #39

The daily panel now keeps its progress, state heading and primary action together. Achievements opens from the panel's top row, removing the isolated trophy row. The bounded panel and larger ring preserve the violet/lime practice design without stretching blank space through the entire workspace. Short windows arrange the ring and heading side by side. All three practice modes still use CardsList; progress remains in the header. The XP explanation opens by click/tap or keyboard in a dismissible popover.

Local Chrome evidence uses synthetic progress, not learner records:

- [Fresh phone](home-balanced-fresh-mobile.png)
- [Completed phone](home-balanced-complete-mobile.png)
- [Desktop](home-balanced-desktop.png)

Verification: `npm run build` passes content/model validation, TypeScript, client artifact and chunk-budget checks. Five focused browser journeys pass with `PTE_TEST_PORT=4198 npx playwright test tests/practice.spec.ts --grep 'daily home groups|simplified workspace fits|daily quest earns real|an empty quest|screen-sized game navigation'`.

The home regression inspects fresh, partial and completed progress at 320×568, 360×640, 390×844, 768×1024 and 1440×900, checks that controls and progress fit the panel, exercises XP help and focus restoration, achievements and completion navigation, and verifies reachable controls at 320×400 through the existing scrolling escape. Existing journeys cover saved rewards, reload/reset, partial quest resume and reduced motion. An old completion-label assertion was updated to the new visible heading; reward values and behaviour assertions remain intact.

This is local Chrome evidence. Native iOS Safari, full-suite coverage, merge and deployment are not claimed. Product/agent guidance needs no change: existing navigation, practice modes, privacy and reward contracts are preserved. Rollback is a presentation-only revert, with no storage/schema migration.
