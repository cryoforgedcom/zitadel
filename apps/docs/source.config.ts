
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

// FUMADOCS_DEV is set by NX build-mdx-source-dev target (used during `nx run dev`).
// NODE_ENV is unreliable during fumadocs-mdx CLI execution.
const isDev = process.env.FUMADOCS_DEV === '1';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebar_label: z.string().optional(),
    }),
    // In dev mode, exclude versioned docs (handled by versions collection)
    // and auto-generated API reference pages (788 files).
    // This reduces .source/server.ts from ~1,100 imports to ~320.
    files: isDev
      ? ['**/*.md', '**/*.mdx', '!v*/**/*', '!**/_*', '!reference/api/**/*']
      : ['**/*.md', '**/*.mdx', '!v*/**/*', '!**/_*'],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
    files: ['**/meta.json', '!v*/**'],
  },
});

export const versions = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebar_label: z.string().optional(),
    }),
    // In dev mode, skip all 4,700+ versioned files entirely.
    files: isDev
      ? ['!**/*']
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
const shikiDev = process.env.NODE_ENV === 'development';
const devLangs: BundledLanguage[] = ['json', 'yaml', 'bash', 'sh', 'go', 'typescript', 'javascript', 'tsx', 'jsx', 'css', 'html', 'sql', 'diff', 'markdown'];
const prodLangs: BundledLanguage[] = ['json', 'yaml', 'bash', 'sh', 'shell', 'http', 'nginx', 'dockerfile', 'go', 'python', 'javascript', 'typescript', 'tsx', 'jsx', 'css', 'html', 'csharp', 'java', 'xml', 'sql', 'properties', 'ini', 'diff', 'markdown', 'mdx', 'dart', 'php', 'ruby', 'toml'];
const shikiLangs = shikiDev ? devLangs : prodLangs;

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
