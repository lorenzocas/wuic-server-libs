export type DocsAudience = 'business' | 'integration' | 'developer' | 'all';
export type DocsStatus = 'stable' | 'beta';

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
