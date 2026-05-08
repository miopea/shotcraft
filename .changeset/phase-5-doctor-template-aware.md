---
"shotcraft": patch
---

`shotcraft doctor` now loads configured templates and reports the real
capture-spec count.

Before: the doctor's spec line called `deriveCaptureSpecs` without
templates, so a config with 6 templates × 6 screens × 2 themes (66
captures) reported as `6 captures (1 theme)` — confusing and wrong.
Now templates are loaded (failures surface as warnings, not blockers),
and the spec count reflects what `shotcraft` would actually run.
