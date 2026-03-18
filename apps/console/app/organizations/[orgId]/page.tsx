import { fetchOrganization } from "@/lib/api/organizations"
import { fetchUsers } from "@/lib/api/fetch-users"
import { OrgDetailClient } from "./org-detail-client"

interface Params {
  orgId: string
}

/**
 * Organization detail page — server component.
 */
export default async function OrganizationDetailPage({ params }: { params: Promise<Params> }) {
  const { orgId } = await params
  let organization: any = null
  let users: any[] = []
  let error: string | null = null

  try {
    const [org, usersResult] = await Promise.all([
      fetchOrganization(orgId),
      fetchUsers(orgId),
    ])
    organization = org
    users = usersResult.users ?? []
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load organization"
    console.error("Failed to load organization:", e)
  }

  return (
    <OrgDetailClient
      organization={organization}
      orgId={orgId}
      users={users}
      error={error}
    />
  )
}
