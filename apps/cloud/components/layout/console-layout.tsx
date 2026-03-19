"use client"

import * as React from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { CloudSidebar } from "@/components/layout/cloud-sidebar"
import { Server, Building2, Search, BookOpen, ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"

interface InstanceInfo {
  id: string
  name: string
  url: string
}

/**
 * Cloud console layout — sidebar + header with instance picker.
 */
export function ConsoleLayout({
  children,
  instances,
}: {
  children: React.ReactNode
  instances: InstanceInfo[]
}) {
  const pathname = usePathname()
  const router = useRouter()

  // Detect current instance from URL
  const instanceMatch = pathname.match(/^\/console\/instances\/([^/]+)/)
  const currentInstanceId = instanceMatch?.[1]
  const currentInstance = instances.find((i) => i.id === currentInstanceId)

  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function selectInstance(id: string) {
    setPickerOpen(false)
    // Navigate to the same sub-path under the new instance
    const subPath = pathname.replace(/^\/console\/instances\/[^/]+/, "").replace(/^\/console/, "")
    const target = subPath && subPath !== "/" ? `/console/instances/${id}${subPath}` : `/console/instances/${id}/overview`
    router.push(target)
  }

  return (
    <SidebarProvider defaultOpen={true} open={true}>
      <CloudSidebar instances={instances} />
      <SidebarInset>
        {/* Header with instance picker */}
        <header className="border-b px-4 py-2 flex items-center gap-3 bg-background sticky top-0 z-10">
          {/* Instance picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen(!pickerOpen)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors min-w-[180px]"
            >
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">
                {currentInstance?.name || currentInstance?.id || "Select instance..."}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
            </button>
            {pickerOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border bg-background shadow-lg z-50">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Find Instance..."
                    className="w-full px-3 py-1.5 rounded-md border text-sm bg-background"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {instances.map((inst) => {
                    let hostname = inst.url
                    try { hostname = new URL(inst.url).hostname } catch {}
                    return (
                      <button
                        key={inst.id}
                        onClick={() => selectInstance(inst.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                      >
                        <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{inst.name || "Unnamed"}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-foreground text-background">active</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{hostname}</span>
                        </div>
                        {inst.id === currentInstanceId && (
                          <span className="text-primary text-sm">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="border-t px-3 py-2">
                  <Link href="/debug" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setPickerOpen(false)}>
                    <span>+</span> Add Instance
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Organization picker placeholder */}
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors min-w-[180px]">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate text-muted-foreground">Select organization...</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
          </button>

          {/* Search */}
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm text-muted-foreground ml-2">
            <Search className="h-3.5 w-3.5" />
            <span>Run a command or search...</span>
            <span className="ml-auto text-xs border rounded px-1">⌘K</span>
          </div>

          {/* Docs link */}
          <Link href="/docs" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Documentation</span>
          </Link>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
