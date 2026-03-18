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
  Settings,
  Zap,
  BarChart3,
  User,
  Filter,
  X,
  ArrowRight,
  Command,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAppContext } from "@/lib/context/app-context"
import { instances, organizations, users, projects, applications } from "@/lib/mock-data"

// Define search token types
type TokenType = "type" | "instance" | "org" | "user" | "project" | "app" | "status" | "text"

interface SearchToken {
  type: TokenType
  value: string
  label: string
}

interface Suggestion {
  id: string
  type: TokenType | "filter" | "action"
  icon: React.ReactNode
  label: string
  description?: string
  value: string
  avatar?: string
}

// Filter suggestions based on current context
const filterSuggestions: Suggestion[] = [
  { id: "type-instance", type: "filter", icon: <Server className="h-4 w-4" />, label: "type:instance", description: "Filter by instances", value: "type:instance" },
  { id: "type-org", type: "filter", icon: <Building2 className="h-4 w-4" />, label: "type:org", description: "Filter by organizations", value: "type:org" },
  { id: "type-user", type: "filter", icon: <Users className="h-4 w-4" />, label: "type:user", description: "Filter by users", value: "type:user" },
  { id: "type-project", type: "filter", icon: <FolderKanban className="h-4 w-4" />, label: "type:project", description: "Filter by projects", value: "type:project" },
  { id: "type-app", type: "filter", icon: <AppWindow className="h-4 w-4" />, label: "type:app", description: "Filter by applications", value: "type:app" },
  { id: "status-active", type: "filter", icon: <Filter className="h-4 w-4" />, label: "status:active", description: "Show active items", value: "status:active" },
  { id: "status-inactive", type: "filter", icon: <Filter className="h-4 w-4" />, label: "status:inactive", description: "Show inactive items", value: "status:inactive" },
]

// Navigation actions
const actionSuggestions: Suggestion[] = [
  { id: "go-instances", type: "action", icon: <Server className="h-4 w-4" />, label: "Go to Instances", description: "View all instances", value: "/" },
  { id: "go-users", type: "action", icon: <Users className="h-4 w-4" />, label: "Go to Users", description: "Manage users", value: "/users" },
  { id: "go-projects", type: "action", icon: <FolderKanban className="h-4 w-4" />, label: "Go to Projects", description: "View projects", value: "/projects" },
  { id: "go-applications", type: "action", icon: <AppWindow className="h-4 w-4" />, label: "Go to Applications", description: "Manage applications", value: "/applications" },
  { id: "go-organizations", type: "action", icon: <Building2 className="h-4 w-4" />, label: "Go to Organizations", description: "View organizations", value: "/organizations" },
  { id: "go-sessions", type: "action", icon: <KeyRound className="h-4 w-4" />, label: "Go to Sessions", description: "Active sessions", value: "/sessions" },
  { id: "go-settings", type: "action", icon: <Settings className="h-4 w-4" />, label: "Go to Settings", description: "Instance settings", value: "/settings" },
  { id: "go-actions", type: "action", icon: <Zap className="h-4 w-4" />, label: "Go to Actions", description: "Manage actions", value: "/actions" },
  { id: "go-analytics", type: "action", icon: <BarChart3 className="h-4 w-4" />, label: "Go to Analytics", description: "View analytics", value: "/analytics" },
]

export function OmniSearch() {
  const router = useRouter()
  const { currentInstance, currentOrganization } = useAppContext()
  const [isOpen, setIsOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [tokens, setTokens] = React.useState<SearchToken[]>([])
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Get contextual suggestions based on query and current tokens
  const getSuggestions = React.useCallback((): Suggestion[] => {
    const lowerQuery = query.toLowerCase().trim()
    const suggestions: Suggestion[] = []

    // If query starts with a filter prefix, show relevant completions
    if (lowerQuery.startsWith("type:")) {
      const typeValue = lowerQuery.replace("type:", "")
      return filterSuggestions
        .filter(s => s.id.startsWith("type-") && s.label.includes(typeValue))
    }

    if (lowerQuery.startsWith("instance:")) {
      const instanceQuery = lowerQuery.replace("instance:", "")
      return instances
        .filter(i => i.name.toLowerCase().includes(instanceQuery) || i.domain.toLowerCase().includes(instanceQuery))
        .slice(0, 6)
        .map(i => ({
          id: `instance-${i.id}`,
          type: "instance" as TokenType,
          icon: <Server className="h-4 w-4" />,
          label: i.name,
          description: i.domain,
          value: `instance:${i.id}`,
        }))
    }

    if (lowerQuery.startsWith("org:")) {
      const orgQuery = lowerQuery.replace("org:", "")
      const filteredOrgs = currentInstance 
        ? organizations.filter(o => o.instanceId === currentInstance.id)
        : organizations
      return filteredOrgs
        .filter(o => o.name.toLowerCase().includes(orgQuery))
        .slice(0, 6)
        .map(o => ({
          id: `org-${o.id}`,
          type: "org" as TokenType,
          icon: <Building2 className="h-4 w-4" />,
          label: o.name,
          description: o.isDefault ? "Default organization" : undefined,
          value: `org:${o.id}`,
        }))
    }

    if (lowerQuery.startsWith("user:")) {
      const userQuery = lowerQuery.replace("user:", "")
      return users
        .filter(u => 
          u.username.toLowerCase().includes(userQuery) || 
          u.email.toLowerCase().includes(userQuery) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(userQuery)
        )
        .slice(0, 6)
        .map(u => ({
          id: `user-${u.id}`,
          type: "user" as TokenType,
          icon: <Avatar className="h-5 w-5"><AvatarFallback className="text-[10px]">{u.firstName[0]}{u.lastName[0]}</AvatarFallback></Avatar>,
          label: `${u.firstName} ${u.lastName}`,
          description: u.email,
          value: `user:${u.id}`,
        }))
    }

    if (lowerQuery.startsWith("project:")) {
      const projectQuery = lowerQuery.replace("project:", "")
      return projects
        .filter(p => p.name.toLowerCase().includes(projectQuery))
        .slice(0, 6)
        .map(p => ({
          id: `project-${p.id}`,
          type: "project" as TokenType,
          icon: <FolderKanban className="h-4 w-4" />,
          label: p.name,
          description: `${p.applications?.length || 0} applications`,
          value: `project:${p.id}`,
        }))
    }

    if (lowerQuery.startsWith("app:")) {
      const appQuery = lowerQuery.replace("app:", "")
      return applications
        .filter(a => a.name.toLowerCase().includes(appQuery))
        .slice(0, 6)
        .map(a => ({
          id: `app-${a.id}`,
          type: "app" as TokenType,
          icon: <AppWindow className="h-4 w-4" />,
          label: a.name,
          description: a.type,
          value: `app:${a.id}`,
        }))
    }

    // Default suggestions: show filters, actions, and search results
    if (!lowerQuery) {
      // Show recent/suggested filters and actions
      return [
        ...filterSuggestions.slice(0, 4),
        ...actionSuggestions.slice(0, 4),
      ]
    }

    // Search across all entities
    const matchingInstances = instances
      .filter(i => i.name.toLowerCase().includes(lowerQuery) || i.domain.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(i => ({
        id: `instance-${i.id}`,
        type: "instance" as TokenType,
        icon: <Server className="h-4 w-4" />,
        label: i.name,
        description: i.domain,
        value: `instance:${i.id}`,
      }))

    const matchingOrgs = organizations
      .filter(o => o.name.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(o => ({
        id: `org-${o.id}`,
        type: "org" as TokenType,
        icon: <Building2 className="h-4 w-4" />,
        label: o.name,
        description: o.isDefault ? "Default organization" : undefined,
        value: `org:${o.id}`,
      }))

    const matchingUsers = users
      .filter(u => 
        u.username.toLowerCase().includes(lowerQuery) || 
        u.email.toLowerCase().includes(lowerQuery) ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 2)
      .map(u => ({
        id: `user-${u.id}`,
        type: "user" as TokenType,
        icon: <User className="h-4 w-4" />,
        label: `${u.firstName} ${u.lastName}`,
        description: u.email,
        value: `user:${u.id}`,
      }))

    const matchingProjects = projects
      .filter(p => p.name.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(p => ({
        id: `project-${p.id}`,
        type: "project" as TokenType,
        icon: <FolderKanban className="h-4 w-4" />,
        label: p.name,
        description: `${p.applications?.length || 0} applications`,
        value: `project:${p.id}`,
      }))

    const matchingApps = applications
      .filter(a => a.name.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(a => ({
        id: `app-${a.id}`,
        type: "app" as TokenType,
        icon: <AppWindow className="h-4 w-4" />,
        label: a.name,
        description: a.type,
        value: `app:${a.id}`,
      }))

    const matchingActions = actionSuggestions
      .filter(a => a.label.toLowerCase().includes(lowerQuery))
      .slice(0, 3)

    const matchingFilters = filterSuggestions
      .filter(f => f.label.toLowerCase().includes(lowerQuery))
      .slice(0, 2)

    suggestions.push(
      ...matchingInstances,
      ...matchingOrgs,
      ...matchingUsers,
      ...matchingProjects,
      ...matchingApps,
      ...matchingFilters,
      ...matchingActions,
    )

    return suggestions.slice(0, 10)
  }, [query, currentInstance])

  const suggestions = getSuggestions()

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && suggestions[selectedIndex]) {
      e.preventDefault()
      handleSelect(suggestions[selectedIndex])
    } else if (e.key === "Escape") {
      setIsOpen(false)
      inputRef.current?.blur()
    } else if (e.key === "Backspace" && query === "" && tokens.length > 0) {
      // Remove last token
      setTokens(prev => prev.slice(0, -1))
    }
  }

  // Handle suggestion selection
  const handleSelect = (suggestion: Suggestion) => {
    if (suggestion.type === "action") {
      // Navigate to the page
      router.push(suggestion.value)
      setIsOpen(false)
      setQuery("")
    } else if (suggestion.type === "filter") {
      // Add as a filter token prefix to query
      setQuery(suggestion.value)
      setSelectedIndex(0)
    } else {
      // Add as token and navigate
      const [type, id] = suggestion.value.split(":")
      
      // Navigate based on type
      switch (type) {
        case "instance":
          router.push("/")
          break
        case "org":
          router.push(`/organizations/${id}`)
          break
        case "user":
          router.push(`/users/${id}`)
          break
        case "project":
          router.push(`/projects/${id}`)
          break
        case "app":
          router.push(`/applications/${id}`)
          break
      }
      
      setIsOpen(false)
      setQuery("")
      setTokens([])
    }
  }

  // Remove a token
  const removeToken = (index: number) => {
    setTokens(prev => prev.filter((_, i) => i !== index))
  }

  // Handle click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Reset selected index when suggestions change
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Keyboard shortcut to open search
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown)
    return () => document.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className={cn(
        "flex items-center gap-1 rounded-md border bg-background px-3 transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}>
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        
        {/* Tokens */}
        {tokens.map((token, index) => (
          <Badge 
            key={index} 
            variant="secondary" 
            className="gap-1 shrink-0 text-xs"
          >
            {token.label}
            <button 
              onClick={() => removeToken(index)}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        <Input
          ref={inputRef}
          type="text"
          placeholder={tokens.length > 0 ? "Add filter..." : "Search or type a command..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="border-0 shadow-none focus-visible:ring-0 px-1 h-9 text-sm"
        />
        
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          <Command className="h-3 w-3" />K
        </kbd>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-md border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left transition-colors",
                  index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <span className="shrink-0 text-muted-foreground">
                  {suggestion.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{suggestion.label}</div>
                  {suggestion.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {suggestion.description}
                    </div>
                  )}
                </div>
                {suggestion.type === "action" && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {suggestion.type === "filter" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">filter</Badge>
                )}
                {suggestion.type !== "action" && suggestion.type !== "filter" && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">{suggestion.type}</Badge>
                )}
              </button>
            ))}
          </div>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Use arrow keys to navigate</span>
            <span>Press Enter to select</span>
          </div>
        </div>
      )}
    </div>
  )
}
