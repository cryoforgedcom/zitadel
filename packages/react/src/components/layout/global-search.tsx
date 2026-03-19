"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Server,
  Building2,
  Users,
  FolderKanban,
  AppWindow,
  KeyRound,
  Zap,
  User,
  Plus,
  Copy,
  Shield,
  Palette,
  Link2,
  Key,
  BookOpen,
  FileText,
  MessageCircle,
  Github,
  LifeBuoy,
  Activity,
  History,
  Fingerprint,
  Globe,
  Settings,
  ExternalLink,
} from "lucide-react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command"
import { useAppContext } from "../../context/app-context"
import { instances, organizations, users } from "../../mock-data"

export function GlobalSearch() {
  const router = useRouter()
  const { currentInstance, currentOrganization, setCurrentInstance, setCurrentOrganization, availableOrganizations } = useAppContext()
  const [open, setOpen] = React.useState(false)

  // Keyboard shortcut to open search
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSelect = (callback: () => void) => {
    setOpen(false)
    callback()
  }

  const handleCopyInstanceUrl = () => {
    if (currentInstance) {
      navigator.clipboard.writeText(`https://${currentInstance.domain}`)
    }
  }

  // Get recent users for quick access
  const recentUsers = currentOrganization
    ? users.filter(u => u.orgId === currentOrganization.id).slice(0, 3)
    : currentInstance
    ? users.filter(u => {
        const org = organizations.find(o => o.id === u.orgId)
        return org?.instanceId === currentInstance.id
      }).slice(0, 3)
    : []

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full max-w-sm justify-start text-sm text-muted-foreground sm:pr-12"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Run a command or search...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Run a command or search..." />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Context-aware actions when instance is selected */}
          {currentInstance && (
            <>
              <CommandItem onSelect={() => handleSelect(handleCopyInstanceUrl)}>
                <Copy className="mr-2 h-4 w-4" />
                <span>Copy Instance URL</span>
                <Badge variant="secondary" className="ml-auto text-[10px] uppercase tracking-wide">
                  {currentInstance.name}
                </Badge>
              </CommandItem>
              <CommandSeparator />
            </>
          )}

          {/* Identity Management */}
          <CommandGroup heading="IDENTITY MANAGEMENT">
            <CommandItem onSelect={() => handleSelect(() => router.push("/users"))}>
              <Search className="mr-2 h-4 w-4" />
              <span>Search Users...</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/users?action=create"))}>
              <Plus className="mr-2 h-4 w-4" />
              <span>Create User...</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/sessions"))}>
              <KeyRound className="mr-2 h-4 w-4" />
              <span>Active Sessions</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/settings/mfa"))}>
              <Fingerprint className="mr-2 h-4 w-4" />
              <span>MFA Settings...</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Applications */}
          <CommandGroup heading="APPLICATIONS">
            <CommandItem onSelect={() => handleSelect(() => router.push("/projects"))}>
              <FolderKanban className="mr-2 h-4 w-4" />
              <span>View Projects</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/applications"))}>
              <AppWindow className="mr-2 h-4 w-4" />
              <span>View Applications</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/applications?action=create"))}>
              <Plus className="mr-2 h-4 w-4" />
              <span>Create Application...</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/settings/keys"))}>
              <Key className="mr-2 h-4 w-4" />
              <span>Get API Keys...</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Configuration */}
          <CommandGroup heading="CONFIGURATION">
            <CommandItem onSelect={() => handleSelect(() => router.push("/organizations"))}>
              <Building2 className="mr-2 h-4 w-4" />
              <span>Organizations</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/settings/idps"))}>
              <Globe className="mr-2 h-4 w-4" />
              <span>Identity Providers...</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/settings/branding"))}>
              <Palette className="mr-2 h-4 w-4" />
              <span>Customize Login UI...</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/actions"))}>
              <Zap className="mr-2 h-4 w-4" />
              <span>Actions</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => router.push("/settings"))}>
              <Shield className="mr-2 h-4 w-4" />
              <span>Security Settings...</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Docs */}
          <CommandGroup heading="DOCS">
            <CommandItem onSelect={() => handleSelect(() => window.open("https://zitadel.com/docs", "_blank"))}>
              <BookOpen className="mr-2 h-4 w-4" />
              <span>Search the docs</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => window.open("https://zitadel.com/docs/apis/introduction", "_blank"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>API Reference</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => window.open("https://zitadel.com/docs/guides/start/quickstart", "_blank"))}>
              <Link2 className="mr-2 h-4 w-4" />
              <span>Quickstart Guides</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Support */}
          <CommandGroup heading="SUPPORT">
            <CommandItem onSelect={() => handleSelect(() => window.open("https://status.zitadel.com", "_blank"))}>
              <Activity className="mr-2 h-4 w-4" />
              <span>View system status</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => window.open("https://zitadel.com/chat", "_blank"))}>
              <MessageCircle className="mr-2 h-4 w-4" />
              <span>Ask Discord community</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => window.open("https://github.com/zitadel/zitadel", "_blank"))}>
              <Github className="mr-2 h-4 w-4" />
              <span>GitHub Repository</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => window.open("https://zitadel.com/contact", "_blank"))}>
              <LifeBuoy className="mr-2 h-4 w-4" />
              <span>Contact support</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Updates */}
          <CommandGroup heading="UPDATES">
            <CommandItem onSelect={() => handleSelect(() => window.open("https://github.com/zitadel/zitadel/releases", "_blank"))}>
              <History className="mr-2 h-4 w-4" />
              <span>View changelog</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Quick Switch - Instances */}
          <CommandGroup heading="SWITCH INSTANCE">
            {instances.slice(0, 5).map((instance) => (
              <CommandItem
                key={instance.id}
                onSelect={() => handleSelect(() => {
                  setCurrentInstance(instance)
                  router.push("/overview")
                })}
              >
                <Server className="mr-2 h-4 w-4" />
                <span>{instance.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{instance.domain}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {/* Quick Switch - Organizations (if instance selected) */}
          {currentInstance && availableOrganizations.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="SWITCH ORGANIZATION">
                {availableOrganizations.slice(0, 5).map((org) => (
                  <CommandItem
                    key={org.id}
                    onSelect={() => handleSelect(() => {
                      setCurrentOrganization(org)
                      router.push("/org/users")
                    })}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <span>{org.name}</span>
                    {org.isDefault && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Default</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Recent Users (if context available) */}
          {recentUsers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="RECENT USERS">
                {recentUsers.map((user) => (
                  <CommandItem
                    key={user.id}
                    onSelect={() => handleSelect(() => router.push(`/users/${user.id}`))}
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>{user.firstName} {user.lastName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{user.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
