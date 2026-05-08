export type Theme = "dark" | "light";

export type TemplateCategory = "app-store" | "play-store" | "readme" | "social";

export interface TemplateSample {
  theme: Theme;
  url: string;
  filename: string;
}

export interface TemplateInfo {
  id: string;
  pkg: string;
  displayName: string;
  category: TemplateCategory;
  viewport: { width: number; height: number; dpr: number };
  output: { width: number; height: number };
  isMobile: boolean;
  themes: ReadonlyArray<Theme>;
  samples: ReadonlyArray<TemplateSample>;
}

export interface TemplatesResponse {
  templates: ReadonlyArray<TemplateInfo>;
}

export interface HealthResponse {
  status: string;
  liveDemoEnabled: boolean;
  version: string;
  /** True when the server was launched via `shotcraft web` with a config file in cwd. */
  localMode?: boolean;
  /** Absolute path of the bound shotcraft.config.json (only when localMode=true). */
  configPath?: string;
}
