import Link from "next/link"
import { listDocPages } from "@/lib/docs-content"

/**
 * Docs index page — lists available documentation sections.
 * Uses ISR with 1 hour revalidation.
 */

export const revalidate = 3600 // Revalidate every hour

export default async function DocsIndexPage() {
  const pages = await listDocPages()

  // Group pages by top-level section
  const sections = new Map<string, typeof pages>()
  for (const page of pages) {
    if (page.slug.length === 0) continue
    const section = page.slug[0]
    if (!sections.has(section)) sections.set(section, [])
    sections.get(section)!.push(page)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-2">
          ZITADEL documentation — rendered at runtime via <code className="bg-muted px-1.5 py-0.5 rounded text-xs">@fumadocs/mdx-remote</code> with ISR.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Content source: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">apps/docs/content/</code> — {pages.length} pages found
        </p>
      </div>

      {Array.from(sections.entries()).slice(0, 8).map(([section, sectionPages]) => (
        <div key={section}>
          <h2 className="text-lg font-semibold capitalize mb-2">{section}</h2>
          <div className="grid gap-2">
            {sectionPages.slice(0, 5).map((page) => (
              <Link
                key={page.slug.join("/")}
                href={`/docs/${page.slug.join("/")}`}
                className="block rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <p className="font-medium text-sm">{page.title}</p>
                {page.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{page.description}</p>
                )}
              </Link>
            ))}
            {sectionPages.length > 5 && (
              <p className="text-xs text-muted-foreground pl-3">
                +{sectionPages.length - 5} more pages
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
