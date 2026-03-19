import Link from "next/link"
import { Server, Plus, Cloud, Star, Clock, ChevronRight, CircleDot } from "lucide-react"
import { getInstances } from "@/lib/instances"

/**
 * Console root page — All Instances dashboard.
 * Matches the multi-instance view: stats, favorites, recently created, instance list.
 */

export default function ConsolePage() {
  const instances = getInstances()
  const total = instances.length
  const active = instances.length // For local dev, all are "active"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instances</h1>
          <p className="text-muted-foreground text-sm">
            Manage your ZITADEL instances across all environments
          </p>
        </div>
        <Link
          href="/debug"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>

      {instances.length > 0 ? (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-foreground text-background p-4">
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-4 w-4 opacity-70" />
              </div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs opacity-70">Total</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <CircleDot className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold">{active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <CircleDot className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Inactive</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Cloud className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Cloud</p>
            </div>
          </div>

          {/* Favorites & Recently Created */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                <h3 className="font-semibold text-sm">Favorites</h3>
              </div>
              <div className="space-y-2">
                {instances.slice(0, 3).map((inst, i) => (
                  <Link
                    key={i}
                    href={`/console/instances/${inst.id}/overview`}
                    className="flex items-center gap-2 py-1 text-sm hover:text-foreground text-muted-foreground transition-colors"
                  >
                    <Cloud className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{inst.name || new URL(inst.url).hostname}</span>
                    <CircleDot className="h-2.5 w-2.5 text-green-500 flex-shrink-0 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Recently Created</h3>
              </div>
              <div className="space-y-2">
                {instances.slice(0, 3).map((inst, i) => (
                  <Link
                    key={i}
                    href={`/console/instances/${inst.id}/overview`}
                    className="flex items-center gap-2 py-1 text-sm hover:text-foreground text-muted-foreground transition-colors"
                  >
                    <Server className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{inst.name || new URL(inst.url).hostname}</span>
                    <CircleDot className="h-2.5 w-2.5 text-green-500 flex-shrink-0 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Instance list */}
          <div className="rounded-lg border">
            <div className="px-4 py-2 border-b flex items-center gap-2 text-xs text-muted-foreground">
              <button className="px-2.5 py-1 rounded-md bg-muted font-medium text-foreground">All</button>
              <button className="px-2.5 py-1 rounded-md hover:bg-muted/50">Active</button>
              <button className="px-2.5 py-1 rounded-md hover:bg-muted/50">Inactive</button>
              <span className="ml-auto">{total} instances</span>
            </div>
            <div className="divide-y">
              {instances.map((inst, i) => {
                let hostname = inst.url
                try { hostname = new URL(inst.url).hostname } catch {}
                return (
                  <Link
                    key={i}
                    href={`/console/instances/${inst.id}/overview`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                    <Cloud className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{inst.name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{hostname}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Local</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">No instances configured</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Add a ZITADEL instance to get started. You can connect to a local instance
            for development or a cloud-hosted one.
          </p>
          <Link
            href="/debug"
            className="inline-flex items-center gap-2 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Configure Instance
          </Link>
        </div>
      )}
    </div>
  )
}
