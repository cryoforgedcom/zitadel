import matter from "gray-matter"
import fs from "node:fs/promises"
import path from "node:path"

/**
 * Docs content loader — fetches MDX from GitHub or local filesystem.
 * 
 * - **Production**: Fetches from GitHub raw content (main branch)
 * - **Preview**: Fetches from GitHub raw content (PR branch via VERCEL_GIT_COMMIT_REF)
 * - **Local dev**: Reads from the local filesystem (../docs/content/)
 * 
 * All modes use ISR with 1-hour revalidation.
 */

const GITHUB_OWNER = "zitadel"
const GITHUB_REPO = "zitadel"
const CONTENT_PATH = "apps/docs/content"

function getBranch(): string {
  // Vercel preview deployments set this to the PR branch
  return process.env.VERCEL_GIT_COMMIT_REF || "main"
}

function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
}

function getGitHubRawUrl(filePath: string): string {
  const branch = getBranch()
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branch}/${CONTENT_PATH}/${filePath}`
}

const LOCAL_CONTENT_DIR = path.resolve(process.cwd(), "../docs/content")

export interface DocPage {
  slug: string[]
  title: string
  description: string
  content: string
  lastModified?: Date
}

/**
 * Fetch a raw file — from GitHub or local filesystem.
 */
async function fetchContent(filePath: string): Promise<string | null> {
  if (isLocalDev()) {
    try {
      return await fs.readFile(path.join(LOCAL_CONTENT_DIR, filePath), "utf-8")
    } catch {
      return null
    }
  }

  const url = getGitHubRawUrl(filePath)
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 }, // ISR: 1 hour
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Get a single doc page by slug.
 */
export async function getDocPage(slug: string[]): Promise<DocPage | null> {
  const slugPath = slug.join("/")

  const candidates = [
    `${slugPath}.mdx`,
    `${slugPath}.md`,
    `${slugPath}/index.mdx`,
    `${slugPath}/index.md`,
  ]

  for (const candidate of candidates) {
    const raw = await fetchContent(candidate)
    if (!raw) continue

    const { data, content } = matter(raw)
    return {
      slug,
      title: data.title ?? slug[slug.length - 1] ?? "Untitled",
      description: data.description ?? "",
      content,
    }
  }

  return null
}

/**
 * Fetch the sidebar structure by reading meta.json files.
 * Returns a tree structure for navigation.
 */
export interface SidebarNode {
  title: string
  slug: string[]
  href: string
  children?: SidebarNode[]
}

/**
 * Fetch a meta.json file for a directory.
 */
async function fetchMeta(dirPath: string): Promise<{ pages?: string[]; title?: string } | null> {
  const raw = await fetchContent(dirPath ? `${dirPath}/meta.json` : "meta.json")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * List top-level doc sections from meta.json or filesystem scan.
 */
export async function listDocSections(): Promise<SidebarNode[]> {
  // Try to read root meta.json for section ordering
  const rootMeta = await fetchMeta("")
  
  if (rootMeta?.pages) {
    return rootMeta.pages
      .filter(p => !p.startsWith("---") && !p.startsWith("v"))
      .map(p => ({
        title: p.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        slug: [p],
        href: `/docs/${p}`,
      }))
  }

  // Fallback: scan filesystem in local dev
  if (isLocalDev()) {
    return listDocPagesLocal()
  }

  return []
}

async function listDocPagesLocal(): Promise<SidebarNode[]> {
  const sections: SidebarNode[] = []
  try {
    const entries = await fs.readdir(LOCAL_CONTENT_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("v")) {
        sections.push({
          title: entry.name.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          slug: [entry.name],
          href: `/docs/${entry.name}`,
        })
      }
    }
  } catch {
    // Content dir not available
  }
  return sections.sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * List all doc pages — for generating navigation.
 * In local dev, scans the filesystem. In production, relies on meta.json.
 */
export async function listDocPages(): Promise<Pick<DocPage, "slug" | "title" | "description">[]> {
  if (!isLocalDev()) {
    // In production, we'd need a manifest file or API
    // For now, return empty — the sidebar uses section-based navigation
    return []
  }

  const pages: Pick<DocPage, "slug" | "title" | "description">[] = []
  
  async function scan(dir: string, prefix: string[] = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !entry.name.startsWith("_")) {
          await scan(path.join(dir, entry.name), [...prefix, entry.name])
        }
      } else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.(mdx|md)$/, "")
        const slug = baseName === "index" ? prefix : [...prefix, baseName]
        
        try {
          const raw = await fs.readFile(path.join(dir, entry.name), "utf-8")
          const { data } = matter(raw)
          pages.push({
            slug,
            title: data.title ?? baseName,
            description: data.description ?? "",
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await scan(LOCAL_CONTENT_DIR)
  return pages
}
