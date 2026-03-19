/**
 * Docs layout inside the cloud app.
 * 
 * Uses a server-rendered sidebar that fetches sections from
 * the content source (local in dev, GitHub in production).
 */

import { DocsSidebar } from "@/components/docs-sidebar"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <DocsSidebar />
      <main className="flex-1 max-w-3xl mx-auto p-8">
        {children}
      </main>
    </div>
  )
}
