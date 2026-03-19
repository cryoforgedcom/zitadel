"use client"

import { useState, useMemo, useEffect, useTransition } from "react"
import { useConsoleRouter } from "@/hooks/use-console-router"
import {
  Users,
  Plus,
  Search,
  X,
  Mail,
  Shield,
  User,
  Loader2,
  Bot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RequirePermission } from "@/components/auth/require-permission"
import { AddUserSheet } from "@/components/users/add-user-sheet"
import { TablePagination } from "@/components/ui/table-pagination"
import { TableSkeleton } from "@/components/skeletons/table-skeleton"
import { useAppContext } from "@/lib/context/app-context"
import { fetchUsers } from "@/lib/api/fetch-users"

interface UsersClientProps {
  users: any[]
  organizations: any[]
  totalResult: number
  error: string | null
}

/**
 * Extract display info from a toJson()-converted User object.
 * In proto3 JSON, oneof `type` serializes as `human` or `machine` key.
 */
function getUserDisplayInfo(user: any) {
  if (user.human) {
    const human = user.human
    return {
      displayName:
        human?.profile?.displayName ||
        `${human?.profile?.givenName ?? ""} ${human?.profile?.familyName ?? ""}`.trim() ||
        user.username ||
        "Unknown",
      email: human?.email?.email ?? "",
      kind: "human" as const,
    }
  }

  if (user.machine) {
    return {
      displayName: user.machine?.name || user.username || "Machine User",
      email: "",
      kind: "machine" as const,
    }
  }

  return {
    displayName: user.username || "Unknown",
    email: "",
    kind: "unknown" as const,
  }
}

function getUserState(state?: string): { label: string; variant: "active" | "inactive" | "destructive" | "warning" } {
  switch (state) {
    case "USER_STATE_ACTIVE":
      return { label: "Active", variant: "active" }
    case "USER_STATE_INACTIVE":
      return { label: "Inactive", variant: "inactive" }
    case "USER_STATE_LOCKED":
      return { label: "Locked", variant: "destructive" }
    case "USER_STATE_INITIAL":
      return { label: "Initial", variant: "warning" }
    default:
      return { label: "Unknown", variant: "inactive" }
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function UsersClient({
  users: initialUsers,
  organizations: initialOrgs,
  totalResult: initialTotalResult,
  error,
}: UsersClientProps) {
  const router = useConsoleRouter()
  const { currentOrganization } = useAppContext()
  const [searchQuery, setSearchQuery] = useState("")
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [users, setUsers] = useState(initialUsers)
  const [organizations, setOrganizations] = useState(initialOrgs)
  const [totalResult, setTotalResult] = useState(initialTotalResult)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [isRefetching, startTransition] = useTransition()

  // Re-fetch users when the selected organization or pagination changes
  useEffect(() => {
    startTransition(async () => {
      try {
        const result = await fetchUsers(currentOrganization?.id ?? null, pageSize, page * pageSize)
        setUsers(result.users)
        setOrganizations(result.organizations)
        setTotalResult(result.totalResult)
      } catch (e) {
        console.error("Failed to refresh users:", e)
      }
    })
  }, [currentOrganization?.id, page, pageSize])

  // Build org ID -> name lookup map
  const orgNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const org of organizations) {
      const orgId = org.organizationId ?? org.id
      if (orgId && org.name) {
        map[orgId] = org.name
      }
    }
    return map
  }, [organizations])

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users
    const q = searchQuery.toLowerCase()
    return users.filter((user: any) => {
      const info = getUserDisplayInfo(user)
      const orgName = orgNameMap[user.details?.resourceOwner] ?? ""
      return (
        info.displayName.toLowerCase().includes(q) ||
        info.email.toLowerCase().includes(q) ||
        (user.username ?? "").toLowerCase().includes(q) ||
        orgName.toLowerCase().includes(q)
      )
    })
  }, [users, searchQuery, orgNameMap])

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage users in your ZITADEL instance
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load users
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Users{" "}
            {isRefetching && (
              <Loader2 className="inline h-5 w-5 animate-spin ml-2" />
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentOrganization
              ? `Users in ${currentOrganization.name}`
              : `Manage users across all organizations (${users.length} total)`}
          </p>
        </div>
        <RequirePermission permission="user.write">
          <Button onClick={() => setAddUserOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </RequirePermission>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            className="pl-9 pr-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isRefetching ? (
        <div className="rounded-lg border">
          <TableSkeleton
            columns={["User", "Organization", "Status", "Created", "Updated"]}
            rows={pageSize}
          />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">
              {searchQuery
                ? "No users match your search"
                : "No users found"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery
                ? "Try adjusting your search query"
                : "Add your first user to get started"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead className="w-[140px]">Organization</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
                <TableHead className="w-[120px]">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user: any) => {
                const info = getUserDisplayInfo(user)
                const stateInfo = getUserState(user.state)

                return (
                  <TableRow
                    key={user.userId ?? user.username}
                    className="cursor-pointer"
                    onClick={() => {
                      if (user.userId) {
                        router.push(`/users/${user.userId}`)
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium flex-shrink-0">
                          {info.kind === "machine" ? (
                            <Bot className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            getInitials(info.displayName)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {info.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {info.email || user.username || ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {orgNameMap[user.details?.resourceOwner] ? (
                        <span className="text-foreground">
                          {orgNameMap[user.details.resourceOwner]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={stateInfo.variant}>
                        {stateInfo.label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.details?.creationDate)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.details?.changeDate)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalResult={totalResult}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
          />
        </div>
      )}

      {/* Add User Sheet */}
      <AddUserSheet
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        organizations={organizations}
      />
    </div>
  )
}
