"use client"

import { useState, useMemo, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Plus, Search, X } from "lucide-react"
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
import { TablePagination } from "@/components/ui/table-pagination"
import { TableSkeleton } from "@/components/skeletons/table-skeleton"
import { fetchOrganizationsPage } from "@/lib/api/fetch-organizations"

interface OrganizationsClientProps {
  organizations: any[]
  totalResult: number
  error: string | null
}

function getOrgState(state?: string): { label: string; variant: "active" | "inactive" | "destructive" | "warning" } {
  switch (state) {
    case "ORGANIZATION_STATE_ACTIVE":
      return { label: "Active", variant: "active" }
    case "ORGANIZATION_STATE_INACTIVE":
      return { label: "Inactive", variant: "inactive" }
    default:
      return { label: "Unknown", variant: "inactive" }
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function OrganizationsClient({
  organizations: initialOrgs,
  totalResult: initialTotalResult,
  error,
}: OrganizationsClientProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [organizations, setOrganizations] = useState(initialOrgs)
  const [totalResult, setTotalResult] = useState(initialTotalResult)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [isRefetching, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      try {
        const result = await fetchOrganizationsPage(pageSize, page * pageSize)
        setOrganizations(result.organizations)
        setTotalResult(result.totalResult)
      } catch (e) {
        console.error("Failed to refresh organizations:", e)
      }
    })
  }, [page, pageSize])

  const filteredOrgs = useMemo(() => {
    if (!searchQuery) return organizations
    const q = searchQuery.toLowerCase()
    return organizations.filter((org: any) =>
      org.name?.toLowerCase().includes(q)
    )
  }, [organizations, searchQuery])

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage organizations in your ZITADEL instance
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load organizations
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
            Organizations
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage organizations in your ZITADEL instance ({organizations.length}{" "}
            total)
          </p>
        </div>
        <RequirePermission permission="org.create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </RequirePermission>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
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
            columns={["Organization", "Status", "Created", "Updated"]}
            rows={pageSize}
            hasLeadingAvatar={true}
          />
        </div>
      ) : filteredOrgs.length === 0 ? (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">
              {searchQuery
                ? "No organizations match your search"
                : "No organizations found"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery
                ? "Try adjusting your search query"
                : "Create your first organization to get started"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Organization</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
                <TableHead className="w-[120px]">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrgs.map((org: any) => {
                const stateInfo = getOrgState(org.state)
                return (
                  <TableRow
                    key={org.id ?? org.name}
                    className="cursor-pointer"
                    onClick={() => {
                      if (org.id) {
                        router.push(`/organizations/${org.id}`)
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 flex-shrink-0">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <p className="font-medium truncate">{org.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={stateInfo.variant}>
                        {stateInfo.label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(
                        org.details?.creationDate ?? org.creationDate
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(
                        org.details?.changeDate
                      )}
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
    </div>
  )
}
