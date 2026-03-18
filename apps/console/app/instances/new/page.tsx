"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Cloud, HardDrive, Server, Globe, Key, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AddInstancePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [hostingType, setHostingType] = useState<"cloud" | "self-hosted" | null>(null)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Instance Directory
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Add New Instance</h1>
          <p className="text-muted-foreground mt-1">
            Connect a ZITADEL instance to manage from your console
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              1
            </div>
            <div className={`h-0.5 flex-1 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              2
            </div>
            <div className={`h-0.5 flex-1 ${step >= 3 ? "bg-primary" : "bg-muted"}`} />
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              3
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Choose Type</span>
            <span>Configure</span>
            <span>Connect</span>
          </div>
        </div>

        {/* Step 1: Choose Type */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Hosting Type</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card 
                className={`cursor-pointer transition-all hover:border-foreground ${
                  hostingType === "cloud" ? "border-foreground bg-muted" : ""
                }`}
                onClick={() => setHostingType("cloud")}
              >
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground mb-2">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">Cloud Hosted</CardTitle>
                  <CardDescription>
                    Managed by ZITADEL in the cloud. Zero infrastructure management required.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      Automatic updates
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      Built-in backups
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      Global regions
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all hover:border-foreground ${
                  hostingType === "self-hosted" ? "border-foreground bg-muted" : ""
                }`}
                onClick={() => setHostingType("self-hosted")}
              >
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground mb-2">
                    <HardDrive className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">Self Hosted</CardTitle>
                  <CardDescription>
                    Run on your own infrastructure. Full control over your deployment.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      Complete data control
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      Custom configuration
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      On-premise deployment
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => setStep(2)} 
                disabled={!hostingType}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Configure Instance</h2>
            
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Instance Name</Label>
                  <Input id="name" placeholder="e.g., Production" />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to identify this instance
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="domain" 
                      placeholder={hostingType === "cloud" ? "mycompany.zitadel.cloud" : "auth.mycompany.com"} 
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hostingType === "cloud" 
                      ? "Your ZITADEL cloud domain" 
                      : "The domain where your ZITADEL instance is hosted"
                    }
                  </p>
                </div>

                {hostingType === "cloud" && (
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Select defaultValue="eu-frankfurt">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eu-frankfurt">EU (Frankfurt)</SelectItem>
                        <SelectItem value="us-virginia">US (Virginia)</SelectItem>
                        <SelectItem value="asia-singapore">Asia (Singapore)</SelectItem>
                        <SelectItem value="au-sydney">Australia (Sydney)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {hostingType === "self-hosted" && (
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" placeholder="e.g., On-premise Datacenter, AWS, GCP" />
                    <p className="text-xs text-muted-foreground">
                      Where is this instance deployed?
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Connect */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Connect to Instance</h2>
            
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">Admin Token</Label>
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="token" 
                      type="password" 
                      placeholder="Enter your admin access token" 
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can generate an admin token from your instance settings
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <h4 className="font-medium text-sm">How to get an admin token:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Go to your ZITADEL instance admin console</li>
                    <li>Navigate to Settings &gt; Personal Access Tokens</li>
                    <li>Create a new token with admin permissions</li>
                    <li>Copy and paste the token above</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => router.push("/")}>
                <Server className="mr-2 h-4 w-4" />
                Add Instance
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
