"use client"


import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAppContext } from "@/lib/context/app-context"
import { usePermissions } from "@/lib/permissions/context"
import { useDeployment } from "@/lib/deployment/context"
import { Badge } from "@/components/ui/badge"
import { AccountDropdown } from "./account-dropdown"
import { useNavCounts } from "@/lib/hooks/use-nav-counts"

/**
 * Nav item configuration with permission and deployment requirements.
 */
interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Required permission to show this nav item */
  permission?: string
  /** Alternative: any of these permissions */
  anyPermission?: string[]
  /** Only show in cloud mode */
  cloudOnly?: boolean
  /** Key into NavCounts for dynamic badge */
  countKey?: string
  /** Context: 'instance' = only when no org selected, 'org' = only when org selected, 'both' = always */
  context?: "instance" | "org" | "both"
}

const navItems: NavItem[] = [
  {
    title: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
    context: "both",
  },
  {
    title: "Organizations",
    href: "/organizations",
    icon: Building2,
    permission: "org.read",
    context: "instance",
    countKey: "organizations",
  },
  {
    title: "Users",
    href: "/users",
    icon: Users,
    permission: "user.read",
    context: "both",
    countKey: "users",
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderKanban,
    permission: "project.read",
    context: "both",
    countKey: "projects",
  },
  {
    title: "Applications",
    href: "/applications",
    icon: AppWindow,
    permission: "project.app.read",
    context: "both",
    countKey: "applications",
  },
  {
    title: "Actions",
    href: "/actions",
    icon: Zap,
    anyPermission: ["iam.action.read", "org.action.read"],
    context: "both",
  },
  {
    title: "Sessions",
    href: "/sessions",
    icon: KeyRound,
    permission: "session.read",
    context: "instance",
  },
  {
    title: "Administrators",
    href: "/administrators",
    icon: UserCog,
    anyPermission: ["iam.member.read", "org.member.read"],
    context: "both",
  },
  {
    title: "Activity Log",
    href: "/activity",
    icon: Activity,
    permission: "events.read",
    context: "both",
  },
  {
    title: "Settings & Policies",
    href: "/settings",
    icon: Shield,
    anyPermission: ["iam.policy.read", "policy.read"],
    context: "both",
  },
]

const cloudOnlyItems: NavItem[] = [
  {
    title: "Instances",
    href: "/instances",
    icon: Server,
    cloudOnly: true,
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    cloudOnly: true,
  },
  {
    title: "Billing",
    href: "/billing",
    icon: CreditCard,
    cloudOnly: true,
  },
  {
    title: "Support",
    href: "/support",
    icon: LifeBuoy,
    cloudOnly: true,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { currentOrganization } = useAppContext()
  const { can, canAny } = usePermissions()
  const { isCloud } = useDeployment()
  const navCounts = useNavCounts(currentOrganization?.id)

  const hasOrgSelected = currentOrganization != null

  /**
   * Check if a nav item should be visible based on permissions, deployment mode,
   * and org context.
   */
  const isVisible = (item: NavItem): boolean => {
    if (item.cloudOnly && !isCloud) return false
    if (item.permission && !can(item.permission)) return false
    if (item.anyPermission && !canAny(item.anyPermission)) return false
    // Context filtering
    const ctx = item.context ?? "both"
    if (ctx === "instance" && hasOrgSelected) return false
    if (ctx === "org" && !hasOrgSelected) return false
    return true
  }

  const visibleItems = navItems.filter(isVisible)
  const visibleCloudItems = cloudOnlyItems.filter(isVisible)

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            Z
          </div>
          <span className="font-semibold text-lg tracking-tight">ZITADEL</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Getting Started Link */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/getting-started"}
                  className="h-9"
                >
                  <Link href="/getting-started" className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4" />
                    <span className="font-medium">Getting Started</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2" />

        {/* Main Navigation */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    className="h-9"
                  >
                    <Link href={item.href} className="flex items-center justify-between">
                      <span className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </span>
                      {item.countKey && navCounts && navCounts[item.countKey as keyof typeof navCounts] > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-normal tabular-nums">
                          {navCounts[item.countKey as keyof typeof navCounts]}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Cloud-only items */}
        {isCloud && visibleCloudItems.length > 0 && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarGroup className="py-1">
              <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cloud
              </div>
              <SidebarGroupContent className="mt-1">
                <SidebarMenu>
                  {visibleCloudItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.href}
                        className="h-9"
                      >
                        <Link href={item.href} className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <AccountDropdown />
      </SidebarFooter>
    </Sidebar>
  )
}
