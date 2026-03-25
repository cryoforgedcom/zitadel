

import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';
// @ts-ignore
import remarkHeadingId from 'remark-heading-id';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebar_label: z.string().optional(),
    }),
    files: ['**/*.md', '**/*.mdx', '!v*/**/*', '!**/_*'], // Exclude versioned folders at root and partials
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
    files: ['v*/**/*.md', 'v*/**/*.mdx', '!**/_*'], // Include only versioned folders from content
    // No includeProcessedMarkdown — versioned pages don't need LLM text,
    // and storing processed text for 4,700+ pages wastes ~50-100MB.
  },
  meta: {
    schema: metaSchema,
    files: ['v*/meta.json', 'v*/**/meta.json'],
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkHeadingId, { defaults: true }]],
    rehypeCodeOptions: {
      themes: {
        light: 'github-dark',
        dark: 'github-dark',
      },
      langs: ['json', 'yaml', 'bash', 'sh', 'shell', 'http', 'nginx', 'dockerfile', 'go', 'python', 'javascript', 'typescript', 'tsx', 'jsx', 'css', 'html', 'csharp', 'java', 'xml', 'sql', 'properties', 'ini', 'diff', 'markdown', 'mdx', 'dart', 'php', 'ruby', 'toml'],
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
