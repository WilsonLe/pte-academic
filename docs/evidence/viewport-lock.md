# Fixed app viewport

The outer document stays fixed on desktop, phones and short landscape windows. Preparation, timed questions and necessary content panels retain contained scrolling; the timed header and actions remain visible. App-controlled zoom gestures, modifier-wheel and zoom shortcuts are suppressed. Browser menus and operating-system accessibility overrides remain outside app control.

Focused verification uses the built static app in installed Chrome with desktop (1440×900), phone (390×844), landscape (844×390) and short-phone (360×400) viewports. It exercises actual document scroll attempts, normal response editing, preparation and exit, metadata and touch policies, plus synthetic cancelable keyboard/wheel/Safari gesture events. Native iOS pinch and operating-system zoom were not tested.

![Phone response with visible exam actions](viewport-phone.png)

![Landscape response with contained scrolling and visible exam actions](viewport-landscape.png)

The responsive navigation/card journeys, complete original-question review matrix, all active response kinds, and writing timer journey cover affected existing consumers. Full-suite testing is deferred until merge is requested. Reverting this change restores the previous viewport policy; no learner-data migration is involved.

Validation: `npm run build` passed, including content/model validation, TypeScript, chunk-budget and static-output contracts. `PTE_TEST_PORT=4216 npx playwright test tests/practice.spec.ts --grep 'fixed viewport|shared cards list pages learning|screen-sized game navigation|writing tools count|all original questions and full mock review|every active response kind'` passed all 7 journeys. Formatting and `git diff --check` passed.

The new landscape regression initially reproduced document movement after response focus; fixing the body in place resolved it without weakening assertions. An earlier browser run overlapped mutable build/output state and was discarded; the final build and browser selection were run sequentially with a fresh isolated preview.
