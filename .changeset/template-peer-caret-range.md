---
"@shotcraft/template-app-store-ipad": patch
"@shotcraft/template-app-store-iphone": patch
"@shotcraft/template-desktop-hero": patch
"@shotcraft/template-play-store-phone": patch
"@shotcraft/template-play-store-tablet": patch
"@shotcraft/template-readme-hero": patch
"@shotcraft/template-social-og-card": patch
---

The peer dependency on `shotcraft` is now a caret range (`^0.1.x`) instead of one exact version. Earlier releases pinned it exactly, so the next `shotcraft` patch could not be installed beside them (npm `ERESOLVE`) until every template was republished. From this release on, a `shotcraft` patch installs beside the templates you already have.
