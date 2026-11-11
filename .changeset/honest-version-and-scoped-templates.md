---
"shotcraft": patch
---

`shotcraft --version` now prints the installed package version instead of a hardcoded `0.0.0`. `shotcraft doctor` now lists scoped community templates (`@your-scope/shotcraft-template-*`), as the template docs already promised. The `init` scaffold and its follow-up message now say plainly that templates must be listed under `templates` before anything renders; until then `shotcraft` writes raw captures only.
