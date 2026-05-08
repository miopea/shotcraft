/**
 * GET /api/templates
 *
 * Returns the registry of first-party Shotcraft templates with metadata
 * and sample-PNG URLs. Consumed by the gallery page.
 */

import { Router } from "express";
import { TEMPLATE_REGISTRY } from "../registry.js";

export const templatesRouter: Router = Router();

templatesRouter.get("/", (_req, res) => {
  res.json({ templates: TEMPLATE_REGISTRY });
});
