"use client"

import { useState, useEffect } from "react"
import {
  Users,
  Building2,
  Shield,
  ArrowRight,
  ExternalLink,
  BookOpen,
  FolderKanban,
  AppWindow,
  Activity,
  Zap,
  CheckCircle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { useDeployment } from "@/lib/deployment/context"
import { useAppContext } from "@/lib/context/app-context"
import { fetchOverviewStats, type OverviewStats } from "@/lib/api/fetch-overview"
import { OverviewSkeleton } from "@/components/skeletons/overview-skeleton"

interface OverviewClientProps {
  initialStats: OverviewStats
  initialError: string | null
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getAuthMethod(session: any): string {
  const factors = session.factors ?? {}
  if (factors.webAuthN) return "Passkey"
  if (factors.otpSms || factors.otpEmail) return "OTP"
  if (factors.intent) return "Intent"
  if (factors.password) return "Password"
  if (factors.user) return "Session"
  return "Unknown"
}

export function OverviewClient({ initialStats, initialError }: OverviewClientProps) {
  const { isSelfHosted } = useDeployment()
  const { currentOrganization } = useAppContext()
  const [stats, setStats] = useState<OverviewStats>(initialStats)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  // Re-fetch when org context changes
  useEffect(() => {
    let cancelled = false

    async function refetch() {
      setLoading(true)
      try {
        const result = await fetchOverviewStats(currentOrganization?.id ?? null)
        if (!cancelled) {
          setStats(result.stats)
          setError(result.error)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    refetch()
    return () => { cancelled = true }
  }, [currentOrganization?.id])

  if (error && !stats.userCount) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Your ZITADEL dashboard
          </p>
        </div>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Connection Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{error}</p>
            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <p className="font-medium">To connect, set the following in your <code>.env</code> file:</p>
              <pre className="text-xs bg-background rounded p-3 overflow-x-auto">
{`ZITADEL_INSTANCE_URL=https://your-instance.zitadel.cloud
ZITADEL_PAT=your-personal-access-token`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const recentSessions = stats.recentSessions

  // Contextual subtitle
  const subtitle = currentOrganization
    ? currentOrganization.name
    : isSelfHosted
      ? "Self-hosted ZITADEL instance"
      : "ZITADEL Cloud instance"

  const statCards = [
    {
      title: "Total Users",
      value: stats.userCount,
      description: currentOrganization ? `In ${currentOrganization.name}` : "Across all organizations",
      icon: Users,
      href: "/users",
    },
    // Show org card only when no org is selected (instance-level view)
    ...(!currentOrganization ? [{
      title: "Organizations",
      value: stats.orgCount,
      description: "Active organizations",
      icon: Building2,
      href: "/organizations",
    }] : []),
    {
      title: "Projects",
      value: stats.projectCount,
      description: "With apps configured",
      icon: FolderKanban,
      href: "/projects",
    },
    {
      title: "Applications",
      value: stats.appCount,
      description: "OIDC, API & SAML apps",
      icon: AppWindow,
      href: "/applications",
    },
  ]

  if (loading && !stats.userCount) {
    return <OverviewSkeleton cardCount={currentOrganization ? 3 : 4} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Stats Grid */}
      <div className={`grid gap-4 ${currentOrganization ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {statCards.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="transition-all hover:border-foreground/30 hover:shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="rounded-lg p-2 bg-muted text-foreground">
                  <stat.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Middle Row: Recent Activity + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest authentication events</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No recent activity
              </p>
            ) : (
              <div className="space-y-1">
                {recentSessions.map((session: any, idx: number) => {
                  const factors = session.factors ?? {}
                  const user = factors.user ?? {}
                  const userId = user.id
                  const displayName = user.displayName || user.loginName || "Unknown"
                  const authMethod = getAuthMethod(session)
                  const initials = displayName
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)

                  const content = (
                    <div
                      className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-md border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs bg-muted">
                          {initials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          Signed in with {authMethod}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-xs"
                        >
                          active
                        </Badge>
                        <span className="text-xs text-muted-foreground w-[60px] text-right">
                          {formatDate(session.creationDate)}
                        </span>
                      </div>
                    </div>
                  )

                  return userId ? (
                    <Link key={session.id || idx} href={`/users/${userId}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={session.id || idx}>{content}</div>
                  )
                })}
              </div>
            )}
            {recentSessions.length > 0 && (
              <Link
                href="/sessions"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
              >
                View all sessions
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/users">
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Manage Users</p>
                      <p className="text-xs text-muted-foreground">View, create, and manage users</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
              <Link href="/projects">
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Manage Projects</p>
                      <p className="text-xs text-muted-foreground">Projects and applications</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
              <Link href="/organizations">
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Organizations</p>
                      <p className="text-xs text-muted-foreground">View and configure organizations</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
              <Link href="/settings">
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Security Settings</p>
                      <p className="text-xs text-muted-foreground">Password policies, login options</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instance Status */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Instance Status</h2>
        <p className="text-sm text-muted-foreground mb-4">System health and connectivity</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-700">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Sessions</p>
                  <p className="text-2xl font-bold">{recentSessions.length > 0 ? recentSessions.length + "+" : "0"}</p>
                  <p className="text-xs text-muted-foreground">Currently online</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-700">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">System Status</p>
                  <p className="text-2xl font-bold">Healthy</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.version ? `ZITADEL ${stats.version}` : "All systems operational"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-muted text-foreground">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Resources</p>
                  <div className="flex gap-3 mt-1">
                    <a
                      href="https://zitadel.com/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="https://github.com/zitadel/zitadel"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      GitHub <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
