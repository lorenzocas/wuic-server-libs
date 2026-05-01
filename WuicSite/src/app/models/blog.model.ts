/**
 * Shape of `public/blog-manifest.json` produced by
 * `scripts/generate-blog-manifest.mjs`. Each entry is one published post.
 *
 * The component only fetches the manifest (a few KB) up front; article
 * bodies live in their own `.md` files under `src/assets/blog/` and are
 * fetched on-demand when the user opens `/blog/:slug`.
 */
export interface BlogManifest {
  generatedAt: string;
  count: number;
  posts: BlogPost[];
}

export interface BlogPost {
  /** URL-safe id, used in the route. */
  slug: string;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  author: string;
  description: string;
  tags: string[];
  readingMinutes: number;
  /** Public-relative path of the .md source the BlogPost component fetches. */
  sourcePath: string;
}
