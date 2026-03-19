import { notFound } from "next/navigation"
import { createCompiler } from "@fumadocs/mdx-remote"
import { getDocPage } from "@/lib/docs-content"

/**
 * Dynamic doc page — compiles MDX at request time using @fumadocs/mdx-remote.
 * 
 * ISR: pages are cached for 1 hour, then revalidated in the background.
 * No rebuild needed when MDX content changes — just wait for revalidation
 * or trigger on-demand via /api/revalidate.
 */

export const revalidate = 3600 // Revalidate every hour

const compiler = createCompiler({
  baseUrl: "https://zitadel.com/docs",
})

/**
 * Strip import/export lines from MDX content.
 * Remote MDX can't resolve local imports — the components are
 * provided via the components prop instead.
 */
function preprocessMdx(source: string): string {
  return source
    .split("\n")
    .filter(line => {
      const trimmed = line.trim()
      if (trimmed.startsWith("import ")) return false
      if (trimmed.startsWith("export ") && !trimmed.startsWith("export default")) return false
      return true
    })
    .join("\n")
}

// Stub components matching apps/docs/mdx-components.tsx
// These provide basic rendering for existing MDX content.
// For full fidelity, import from fumadocs-ui once integrated.

function Callout({ children, type }: { children: React.ReactNode; type?: string }) {
  const borderColor = type === "warning" ? "border-amber-500" : type === "error" ? "border-red-500" : "border-primary"
  return (
    <div className={`rounded-lg border-l-4 ${borderColor} bg-muted/50 p-4 my-4`}>
      {children}
    </div>
  )
}

function Admonition({ children, type }: { children: React.ReactNode; type?: string }) {
  return <Callout type={type}>{children}</Callout>
}

function Tabs({ children }: { children: React.ReactNode }) {
  return <div className="my-4 space-y-2">{children}</div>
}

function Tab({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="group border rounded-lg">
      <summary className="p-3 font-medium text-sm cursor-pointer">{label ?? "Tab"}</summary>
      <div className="p-3 pt-0">{children}</div>
    </details>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
  return <div className="my-4 space-y-4 border-l-2 border-muted pl-6">{children}</div>
}

function Step({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="relative">
      <div className="absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full bg-primary" />
      {title && <h4 className="font-medium mb-1">{title}</h4>}
      {children}
    </div>
  )
}

function Card({ children, title, href, description }: { children?: React.ReactNode; title: string; href?: string; description?: string; icon?: React.ReactNode }) {
  const inner = (
    <div className="rounded-lg border p-4 hover:bg-accent transition-colors">
      <h3 className="font-semibold text-sm">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      {children}
    </div>
  )
  if (href) return <a href={href}>{inner}</a>
  return inner
}

function Cards({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 my-4">{children}</div>
}

/**
 * MDX component map.
 * Known components get real implementations; custom docs components
 * get passthrough or placeholder stubs so pages never crash.
 */

// Helper: renders children as-is (for wrapper components)
const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>
// Helper: renders nothing (for interactive/void components)
const placeholder = () => null

const mdxComponents: Record<string, React.ComponentType<any>> = {
  // Real implementations
  Callout,
  Admonition,
  Tab,
  Tabs,
  Step,
  Steps,
  Card,
  Cards,

  // Complex components with placeholder
  APIPage: () => <div className="rounded-lg border p-4 bg-muted/50 text-sm text-muted-foreground">[API Reference — requires full integration]</div>,
  
  // Passthrough components (render children)
  TerminologyUpdate: passthrough,
  AppConfig: passthrough,
  AppValues: passthrough,
  FrameworkSelector: passthrough,
  Intro: passthrough,
  IDPsOverview: passthrough,
  GeneralConfigDescription: passthrough,
  CustomLoginPolicy: passthrough,
  Activate: passthrough,
  TestSetup: passthrough,
  DynamicCodeBlock: passthrough,
  GithubCodeBlock: passthrough,
  PrefillAction: passthrough,
  ProxyGuideTLSMode: passthrough,
  TargetID: passthrough,
  Folder: passthrough,
  FileText: passthrough,
  BenchmarkChart: passthrough,
  
  // Void / interactive stubs
  TOKEN: placeholder,
  YOUR: placeholder,
  LabelDescriptor: passthrough,
  AudienceLabel: passthrough,
  SetResourceApiBody: passthrough,
  ListResourceApiBody: passthrough,
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const page = await getDocPage(slug)

  if (!page) {
    notFound()
  }

  const compiled = await compiler.compile({
    source: preprocessMdx(page.content),
  })

  const MdxContent = compiled.body

  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <div className="not-prose mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
        {page.description && (
          <p className="text-muted-foreground mt-2">{page.description}</p>
        )}
        {page.lastModified && (
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: {page.lastModified.toLocaleDateString()}
          </p>
        )}
      </div>

      <MdxContent components={mdxComponents} />
    </article>
  )
}
