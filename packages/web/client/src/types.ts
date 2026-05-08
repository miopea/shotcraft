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
  output: { width: number; height: number };
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
}
