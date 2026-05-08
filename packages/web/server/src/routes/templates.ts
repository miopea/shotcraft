/**
 * GET /api/templates
 *
 * Returns the registry of installed Shotcraft templates with metadata + sample
 * PNG URLs. The gallery page consumes this to render template cards.
 *
 * v0 stub — returns an empty array. Real implementation lands in Phase 8 once
 * we have at least one published `@shotcraft/template-*` package to discover.
 */

import { Router } from "express";

export const templatesRouter: Router = Router();

templatesRouter.get("/", (_req, res) => {
  res.json({
    templates: [],
    note: "v0 stub — template discovery lands in Phase 8 of the v1 plan.",
  });
});
