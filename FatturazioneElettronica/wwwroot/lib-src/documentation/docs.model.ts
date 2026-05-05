export type DocsAudience = 'business' | 'integration' | 'developer' | 'all';
export type DocsStatus = 'stable' | 'beta';
/**
 * Tier label for the feature documented by the page.
 * - 'dev-and-pro' → included in both Developer and Professional tier (default, most features)
 * - 'pro' → Professional tier only (Spreadsheet, Pivot, Designer, Workflow, Report, RAG, Offline CRUD)
 * When omitted in the manifest, the page is treated as 'dev-and-pro'.
 */
export type DocsTier = 'dev-and-pro' | 'pro';

export interface DocsImage {
  id: string;
  caption: string;
  path: string;
  status: 'available' | 'unavailable';
}

export interface DocsCodeSample {
  id: string;
  title: string;
  language: string;
  code: string;
}

export interface DocsSection {
  id: string;
  title: string;
  html: string;
  codeSamples?: DocsCodeSample[];
}

export interface DocsPage {
  slug: string;
  lang: string;
  title: string;
  description: string;
  audience: DocsAudience[];
  status: DocsStatus;
  tier?: DocsTier;
  tags: string[];
  keywords: string[];
  toc: { id: string; title: string }[];
  sections: DocsSection[];
  images: DocsImage[];
}

export interface DocsNavItem {
  slug: string;
  title: string;
  titles?: Record<string, string>;
  icon?: string;
  status?: DocsStatus;
  audience?: DocsAudience[];
  tier?: DocsTier;
}

export interface DocsNavGroup {
  id: string;
  title: string;
  titles?: Record<string, string>;
  items: DocsNavItem[];
}

export interface DocsContentManifest {
  version: string;
  generatedAt: string;
  groups: DocsNavGroup[];
  pages: DocsPage[];
}
