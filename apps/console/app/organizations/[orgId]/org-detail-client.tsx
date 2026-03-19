"use client"

import { ConsoleLink as Link } from "@/lib/context/link-context"
import { useAppContext } from "@/lib/context/app-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Building2, Users, ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface OrgDetailClientProps {
  organization: any
  orgId: string
  users: any[]
  error: string | null
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString()
}

function getOrgState(org: any): { label: string; variant: "active" | "inactive" | "destructive" | "warning" } {
  const state = org?.state ?? "ORG_STATE_UNSPECIFIED"
  const labels: Record<string, { label: string; variant: "active" | "inactive" | "destructive" | "warning" }> = {
    ORG_STATE_ACTIVE: { label: "Active", variant: "active" },
    ORG_STATE_INACTIVE: { label: "Inactive", variant: "inactive" },
    ORG_STATE_REMOVED: { label: "Removed", variant: "destructive" },
    ORG_STATE_UNSPECIFIED: { label: "Unknown", variant: "inactive" },
  }
  return labels[state] ?? { label: state, variant: "inactive" }
}

export function OrgDetailClient({ organization, orgId, users, error }: OrgDetailClientProps) {
  const { setCurrentOrganization } = useAppContext()

  if (error || !organization) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <h1 className="text-2xl font-bold">
          {error ? "Failed to load organization" : "Organization not found"}
        </h1>
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        <Button asChild>
          <Link href="/organizations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Organizations
          </Link>
        </Button>
      </div>
    )
  }

  const stateInfo = getOrgState(organization)
  const details = organization.details ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/organizations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{organization.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge variant={stateInfo.variant}>
                {stateInfo.label}
              </StatusBadge>
              {organization.isDefault && (
                <Badge variant="secondary">Default</Badge>
              )}
              <Badge variant="outline" className="font-mono text-xs">
                {orgId}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentOrganization({ id: orgId, name: organization.name })}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Switch to Org
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(details.creationDate)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Changed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(details.changeDate)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Organization ID</p>
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{orgId}</code>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{organization.name}</p>
              </div>
              {organization.primaryDomain && (
                <div>
                  <p className="text-sm text-muted-foreground">Primary Domain</p>
                  <p className="font-medium">{organization.primaryDomain}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Resource Owner</p>
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                  {details.resourceOwner ?? "—"}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Users in this organization</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-muted-foreground">No users in this organization</p>
              ) : (
                <div className="space-y-2">
                  {users.slice(0, 20).map((user: any) => {
                    const human = user.human ?? {}
                    const profile = human.profile ?? {}
                    const displayName = profile.displayName || profile.givenName || user.userId
                    const email = human.email?.email ?? ""
                    const initials = (profile.givenName?.[0] ?? "") + (profile.familyName?.[0] ?? "")
                    return (
                      <Link
                        key={user.userId}
                        href={`/users/${user.userId}`}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {initials.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{displayName}</p>
                            {email && (
                              <p className="text-xs text-muted-foreground">{email}</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    )
                  })}
                  {users.length > 20 && (
                    <p className="text-sm text-muted-foreground text-center pt-2">
                      Showing 20 of {users.length} users
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
