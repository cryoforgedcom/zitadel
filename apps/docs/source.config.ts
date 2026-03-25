
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';
import type { BundledLanguage } from 'shiki';
// @ts-ignore
import remarkHeadingId from 'remark-heading-id';

// NODE_ENV isn't reliably set when fumadocs-mdx CLI runs.
// Use FUMADOCS_DEV=1 to enable dev optimizations (set in package.json dev script).
const isDev = process.env.FUMADOCS_DEV === '1' || process.env.NODE_ENV === 'development';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebar_label: z.string().optional(),
    }),
    files: isDev
      ? ['**/*.md', '**/*.mdx', '!v*/**/*', '!**/_*', '!reference/api/**/*'] // Exclude 788 API reference pages in dev
      : ['**/*.md', '**/*.mdx', '!v*/**/*', '!**/_*'],
    postprocess: {
      includeProcessedMarkdown: !isDev, // Skip processed markdown in dev to save memory
    },
  },
  meta: {
    schema: metaSchema,
    files: ['**/meta.json', '!v*/**'],
  },
});

// In dev mode, skip versioned docs entirely to save ~4GB of memory.
// Versioned pages (v4.10, v4.11, etc.) are static and never change during development.
// They are only needed for production builds.
export const versions = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebar_label: z.string().optional(),
    }),
    files: isDev
      ? ['!**/*'] // Match nothing in dev — skip all 4,700+ versioned files
      : ['v*/**/*.md', 'v*/**/*.mdx', '!**/_*'],
  },
  meta: {
    schema: metaSchema,
    files: isDev
      ? ['!**/*']
      : ['v*/meta.json', 'v*/**/meta.json'],
  },
});


// In dev mode, load fewer Shiki languages to reduce memory and startup time.
const devLangs: BundledLanguage[] = ['json', 'yaml', 'bash', 'sh', 'go', 'typescript', 'javascript', 'tsx', 'jsx', 'css', 'html', 'sql', 'diff', 'markdown'];
const prodLangs: BundledLanguage[] = ['json', 'yaml', 'bash', 'sh', 'shell', 'http', 'nginx', 'dockerfile', 'go', 'python', 'javascript', 'typescript', 'tsx', 'jsx', 'css', 'html', 'csharp', 'java', 'xml', 'sql', 'properties', 'ini', 'diff', 'markdown', 'mdx', 'dart', 'php', 'ruby', 'toml'];
const shikiLangs = isDev ? devLangs : prodLangs;

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkHeadingId, { defaults: true }]],
    rehypeCodeOptions: {
      themes: {
        light: 'github-dark',
        dark: 'github-dark',
      },
      langs: shikiLangs,
      langAlias: {
        'env': 'bash',
        'dotenv': 'bash',
        'curl': 'bash',
        'caddy': 'nginx',
        'conf': 'nginx',
        'https': 'http',
        'HTTP': 'http',
        'JSON': 'json',
        'twig': 'html',
        'mermaid': 'markdown',
        'text': 'bash',
      },
    },
  },
});
