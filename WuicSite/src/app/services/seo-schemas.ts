/**
 * Pure builders for per-page JSON-LD payloads consumed by SeoService.
 * Each helper returns a plain object ready to be passed as
 * `structuredData` in `seo.set({...})`.
 *
 * Intentionally keeps the schemas minimal — schema.org accepts a lot more
 * fields per type, but stuffing every optional property hurts maintainability
 * without measurable SEO gain. Add fields only when a concrete page needs them.
 */

const BASE_URL = 'https://wuic-framework.com';

export interface ArticleSchemaInput {
  /** Article headline — keep ≤110 chars per Google guidelines. */
  headline: string;
  /** Plain-text summary used in rich results. */
  description: string;
  /** Path on this site, e.g. '/blog/why-metadata-driven'. */
  path: string;
  /** ISO 8601 publish date, e.g. '2026-05-01'. */
  datePublished: string;
  /** ISO 8601 last-modified date. Defaults to datePublished if omitted. */
  dateModified?: string;
  /** Author display name. Defaults to the org. */
  authorName?: string;
  /** Optional cover image absolute URL. */
  image?: string;
}

export function articleSchema(input: ArticleSchemaInput): object {
  const url = `${BASE_URL}${input.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: {
      '@type': input.authorName ? 'Person' : 'Organization',
      name: input.authorName ?? 'WUIC Framework',
    },
    publisher: { '@id': `${BASE_URL}/#org` },
    ...(input.image ? { image: input.image } : {}),
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * Use on pages that have a real, visible FAQ section. Stuffing FAQPage
 * schema on pages without a corresponding visible Q&A block can trigger
 * a manual penalty from Google (March 2024 rich-result policy update).
 */
export function faqPageSchema(faqs: FaqEntry[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export interface BreadcrumbCrumb {
  /** Display label, e.g. 'Blog'. */
  name: string;
  /** Path on this site OR fully-qualified URL. */
  pathOrUrl: string;
}

export function breadcrumbsSchema(crumbs: BreadcrumbCrumb[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.pathOrUrl.startsWith('http') ? c.pathOrUrl : `${BASE_URL}${c.pathOrUrl}`,
    })),
  };
}

export interface SoftwareAppSchemaInput {
  /** Feature/product name shown in rich results. */
  name: string;
  description: string;
  /** Path of the page describing this feature. */
  path: string;
  /** e.g. 'DeveloperApplication', 'BusinessApplication'. */
  applicationCategory?: string;
  /** Optional aggregate rating — only emit when you have real data. */
  rating?: { value: number; reviewCount: number };
}

/**
 * Use for feature/product pages (e.g. /comparison, /features). The sitewide
 * SoftwareApplication block in index.html already covers the product as a
 * whole — only emit per-page when describing a concrete feature variant or
 * comparison page that needs its own canonical schema.
 */
export function softwareAppSchema(input: SoftwareAppSchemaInput): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: `${BASE_URL}${input.path}`,
    applicationCategory: input.applicationCategory ?? 'DeveloperApplication',
    operatingSystem: 'Windows, Linux, macOS',
    publisher: { '@id': `${BASE_URL}/#org` },
    ...(input.rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.rating.value,
            reviewCount: input.rating.reviewCount,
          },
        }
      : {}),
  };
}
