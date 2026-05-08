---
"@shotcraft/template-readme-hero": minor
---

First release — GitHub README hero template.

Composes a 428×926 (dpr 2) capture into a 1280×640 landscape PNG. Asymmetric
two-pane — bold caption + tagline in left 52 %, iPhone-shaped frame in
right 48 % at 96 % canvas height. Subtle gradient backgrounds (slate-900
→ slate-800 dark, slate-50 → slate-100 light) keep the composition
uncluttered alongside README badges + code blocks.

Both `dark` and `light` ship as separate composites — README authors
typically swap via `<picture>` + `prefers-color-scheme`. The README
suggests the exact `<picture>` snippet.

Ships `samples/hero-{dark,light}.png`.
