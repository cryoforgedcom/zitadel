"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Users,
  FolderKanban,
  AppWindow,
  Building2,
  Zap,
  BarChart3,
  KeyRound,
  UserCog,
  Activity,
  LayoutDashboard,
  Shield,
  Sparkles,
  CreditCard,
  LifeBuoy,
  Server,
  ChevronDown,
  Check,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useState, useRef, useEffect } from "react"

/**
 * Cloud-specific sidebar — instance-scoped paths.
 * Detects the current instance ID from the URL and prefixes all links.
 */

interface NavItem {
  title: string
  path: string // relative to /console/instances/[id]/
  icon: React.ComponentType<{ className?: string }>
}

interface InstanceInfo {
  id: string
  name: string
  url: string
}

const instanceItems: NavItem[] = [
  { title: "Overview", path: "overview", icon: LayoutDashboard },
  { title: "Organizations", path: "organizations", icon: Building2 },
  { title: "Users", path: "users", icon: Users },
  { title: "Projects", path: "projects", icon: FolderKanban },
  { title: "Applications", path: "applications", icon: AppWindow },
  { title: "Actions", path: "actions", icon: Zap },
  { title: "Sessions", path: "sessions", icon: KeyRound },
  { title: "Administrators", path: "administrators", icon: UserCog },
  { title: "Activity Log", path: "activity", icon: Activity },
  { title: "Settings & Policies", path: "settings", icon: Shield },
]

export function CloudSidebar({ instances }: { instances: InstanceInfo[] }) {
  const pathname = usePathname()

  // Detect instance from URL: /console/instances/{id}/...
  const instanceMatch = pathname.match(/^\/console\/instances\/([^/]+)/)
  const currentInstanceId = instanceMatch?.[1]
  const currentInstance = instances.find((i) => i.id === currentInstanceId)
  const instanceBase = currentInstanceId ? `/console/instances/${currentInstanceId}` : null

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background text-sm font-bold">
            Z
          </div>
          <span className="font-semibold text-lg">ZITADEL</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Cloud top-level */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/console/getting-started"}>
                  <Link href="/console/getting-started">
                    <Sparkles className="h-4 w-4" />
                    <span>Getting Started</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/console"}>
                  <Link href="/console">
                    <Server className="h-4 w-4" />
                    <span>All Instances</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Instance section — always shown */}
        {instances.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>
                {currentInstance?.name || instances[0]?.name || "Instance"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {instanceItems.map((item) => {
                    const base = instanceBase || `/console/instances/${instances[0]?.id}`
                    const href = `${base}/${item.path}`
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton asChild isActive={pathname === href || pathname.startsWith(href + "/")}>
                          <Link href={href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/console/billing" || pathname.startsWith("/console/billing/")}>
              <Link href="/console/billing">
                <CreditCard className="h-4 w-4" />
                <span>Billing & Usage</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/console/support"}>
              <Link href="/console/support">
                <LifeBuoy className="h-4 w-4" />
                <span>Support</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
