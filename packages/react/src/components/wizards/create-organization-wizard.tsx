"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Building2, Users, Settings, Globe } from "lucide-react"
import {
  StepWizard,
  StepContent,
  StepActions,
  FormSection,
  ParameterRow,
  InfoBox,
  type WizardStep,
} from "../ui/step-wizard"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { Checkbox } from "../ui/checkbox"
import { cn } from "../../utils"
import { useAppContext } from "../../context/app-context"

const steps: WizardStep[] = [
  { id: "details", title: "Organization Details", description: "Basic information" },
  { id: "settings", title: "Settings", description: "Configure organization" },
  { id: "admin", title: "Administrator", description: "Set up admin access" },
  { id: "confirmation", title: "Confirmation", description: "Review and create" },
]

const orgTypes = [
  { id: "company", name: "Company", description: "For business organizations", icon: Building2 },
  { id: "team", name: "Team", description: "For departments or teams", icon: Users },
  { id: "personal", name: "Personal", description: "For individual use", icon: Globe },
]

interface CreateOrganizationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationWizard({ open, onOpenChange }: CreateOrganizationWizardProps) {
  const router = useRouter()
  const { currentInstance } = useAppContext()
  
  const [orgName, setOrgName] = React.useState("")
  const [orgType, setOrgType] = React.useState("company")
  const [description, setDescription] = React.useState("")
  const [domain, setDomain] = React.useState("")
  const [verifyDomain, setVerifyDomain] = React.useState(false)
  const [allowSelfRegistration, setAllowSelfRegistration] = React.useState(false)
  const [adminEmail, setAdminEmail] = React.useState("")
  const [adminName, setAdminName] = React.useState("")
  const [createAsAdmin, setCreateAsAdmin] = React.useState(true)

  const handleComplete = () => {
    onOpenChange(false)
    router.push("/organizations")
  }

  const selectedOrgType = orgTypes.find(t => t.id === orgType)

  return (
    <StepWizard
      steps={steps}
      open={open}
      onOpenChange={onOpenChange}
      title="Create Organization"
      onComplete={handleComplete}
    >
      {/* Step 1: Organization Details */}
      <StepContent stepId="details">
        <FormSection
          title="Organization Information"
          description="Enter basic details about the organization"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme Corporation"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This will be displayed across the platform
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="A brief description of your organization..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Organization Type" className="mt-6">
          <RadioGroup value={orgType} onValueChange={setOrgType} className="space-y-2">
            {orgTypes.map((type) => {
              const Icon = type.icon
              return (
                <label
                  key={type.id}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                    orgType === type.id ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
                  )}
                >
                  <RadioGroupItem value={type.id} id={type.id} className="mt-0.5" />
                  <div className="flex items-start gap-3">
                    <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-sm">{type.name}</span>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                </label>
              )
            })}
          </RadioGroup>
        </FormSection>

        <StepActions nextDisabled={!orgName} />
      </StepContent>

      {/* Step 2: Settings */}
      <StepContent stepId="settings">
        <FormSection
          title="Domain Settings"
          description="Configure domain-based features for your organization"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Primary Domain (Optional)</Label>
              <Input
                id="domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
              />
              <p className="text-xs text-muted-foreground">
                Users with this email domain can be auto-assigned to this organization
              </p>
            </div>

            {domain && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="verifyDomain"
                  checked={verifyDomain}
                  onCheckedChange={(checked) => setVerifyDomain(checked === true)}
                />
                <label htmlFor="verifyDomain" className="text-sm cursor-pointer leading-relaxed">
                  <span className="font-medium">Verify domain ownership</span>
                  <p className="text-xs text-muted-foreground">
                    Required for domain-based user provisioning
                  </p>
                </label>
              </div>
            )}
          </div>
        </FormSection>

        <FormSection title="User Management" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="selfRegistration"
                checked={allowSelfRegistration}
                onCheckedChange={(checked) => setAllowSelfRegistration(checked === true)}
              />
              <label htmlFor="selfRegistration" className="text-sm cursor-pointer leading-relaxed">
                <span className="font-medium">Allow self-registration</span>
                <p className="text-xs text-muted-foreground">
                  Users can sign up and join this organization without an invite
                </p>
              </label>
            </div>
          </div>
        </FormSection>

        <InfoBox
          title="Instance"
          description={`Organization will be created in ${currentInstance?.name || "the current instance"}`}
          variant="default"
        />

        <StepActions />
      </StepContent>

      {/* Step 3: Administrator */}
      <StepContent stepId="admin">
        <FormSection
          title="Organization Administrator"
          description="Set up the first admin for this organization"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="createAsAdmin"
                checked={createAsAdmin}
                onCheckedChange={(checked) => setCreateAsAdmin(checked === true)}
              />
              <label htmlFor="createAsAdmin" className="text-sm cursor-pointer leading-relaxed">
                <span className="font-medium">Set me as the administrator</span>
                <p className="text-xs text-muted-foreground">
                  You will have full control over this organization
                </p>
              </label>
            </div>

            {!createAsAdmin && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Administrator Name</Label>
                  <Input
                    id="adminName"
                    placeholder="John Doe"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Administrator Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@acme.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    An invitation will be sent to this email
                  </p>
                </div>
              </div>
            )}
          </div>
        </FormSection>

        <InfoBox
          title="Administrator Permissions"
          variant="default"
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground" />
              Manage organization settings and branding
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground" />
              Add and remove users
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground" />
              Create and manage projects
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground" />
              Configure authentication policies
            </li>
          </ul>
        </InfoBox>

        <StepActions nextDisabled={!createAsAdmin && (!adminName || !adminEmail)} />
      </StepContent>

      {/* Step 4: Confirmation */}
      <StepContent stepId="confirmation">
        <FormSection title="Review Organization">
          <div className="rounded-lg border divide-y">
            <ParameterRow label="Name" value={orgName || "—"} />
            <ParameterRow label="Type" value={selectedOrgType?.name || "—"} />
            {description && <ParameterRow label="Description" value={description} />}
            {domain && <ParameterRow label="Domain" value={domain} />}
            <ParameterRow 
              label="Self-Registration" 
              value={allowSelfRegistration ? "Enabled" : "Disabled"} 
            />
            <ParameterRow 
              label="Administrator" 
              value={createAsAdmin ? "You" : adminName || "—"} 
            />
          </div>
        </FormSection>

        <InfoBox
          title="Organization Created"
          description="The organization will be immediately available after creation."
          variant="success"
        >
          <ul className="space-y-1 text-xs">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-green-600" />
              {createAsAdmin ? "You" : adminName} will be set as owner
            </li>
            {domain && (
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-green-600" />
                Domain {domain} will be associated
              </li>
            )}
          </ul>
        </InfoBox>

        <StepActions nextLabel="Create Organization" />
      </StepContent>
    </StepWizard>
  )
}
