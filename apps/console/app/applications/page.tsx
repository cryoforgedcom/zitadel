import { fetchAllApplications } from "@/lib/api/fetch-all-applications"
import { ApplicationsClient } from "./applications-client"

/**
 * Applications list page — server component.
 */
export default async function ApplicationsPage() {
  let applications: any[] = []
  let totalResult = 0
  let error: string | null = null

  try {
    const result = await fetchAllApplications(10)
    applications = result.applications
    totalResult = result.totalResult
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load applications"
    console.error("Failed to load applications:", e)
  }

  return <ApplicationsClient applications={applications} totalResult={totalResult} error={error} />
}
