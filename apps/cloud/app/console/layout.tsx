import { ConsoleLayout } from '@/components/layout/console-layout'
import { getInstances } from '@/lib/instances'
import { isInstanceConfigured } from '@/lib/api/transport'
import { AppProvider } from '@/lib/context/app-context'
import { PermissionProvider } from '@/lib/permissions/context'
import { DeploymentProvider } from '@/lib/deployment/context'
import { Toaster } from '@/components/ui/toaster'
import { discoverUserRoles } from '@/lib/api/auth'
import { listOrganizations } from '@/lib/api/organizations'
import { toJson } from '@zitadel/client'
import { ListOrganizationsResponseSchema } from '@zitadel/proto/zitadel/org/v2/org_service_pb'

/**
 * Console layout — wraps /console/* routes.
 * IMPORTANT: All imports use @/ (cloud's own modules) because the
 * re-exported console page components also resolve @/ to cloud.
 * Using @console/* here would create separate React Context objects.
 */
export default async function ConsoleRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const instances = getInstances()
  const configured = isInstanceConfigured()

  let roles: string[] = []
  let orgs: any[] = []

  if (configured) {
    try {
      const [userRoles, orgsResponse] = await Promise.all([
        discoverUserRoles(),
        listOrganizations({ pageSize: 10 })
          .then((res) => {
            const json = toJson(ListOrganizationsResponseSchema, res) as any
            return (json.result ?? []).map((org: any) => ({
              id: org.id ?? "",
              name: org.name ?? "",
              primaryDomain: org.primaryDomain ?? "",
              isDefault: false,
            }))
          })
          .catch((e) => {
            console.error("Failed to load organizations:", e)
            return []
          }),
      ])
      roles = userRoles
      orgs = orgsResponse
    } catch (e) {
      console.error("Failed to initialize console context:", e)
    }
  }

  return (
    <DeploymentProvider>
      <PermissionProvider initialRoles={roles}>
        <AppProvider initialOrganizations={orgs}>
          <ConsoleLayout instances={instances.map(i => ({ id: i.id, name: i.name, url: i.url }))}>
            {children}
          </ConsoleLayout>
          <Toaster />
        </AppProvider>
      </PermissionProvider>
    </DeploymentProvider>
  )
}
