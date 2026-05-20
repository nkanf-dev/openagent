import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isAdminUser, isChatAdminUser, isLocalAdminUser } from "~/backend/AccountBackend"
import { type Store, claimStore, deleteStore, getStore, getStores, updateStore } from "~/backend/StoreBackend"
import {
  getProviderDisplayName,
  getProviderLogoUrl,
  getProviders,
  getServers,
  getSkills,
  getTools,
  type Provider,
} from "~/backend/ProviderBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import {
  FormField,
  MultiSelect,
  NumberInput,
  SectionCard,
  TagInput,
} from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Store — OpenAgent" }]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StoreEditPage() {
  const { owner, storeName } = useParams<{ owner: string; storeName: string }>()
  const navigate = useNavigate()
  const { account } = useAccount()

  const [store, setStore] = useState<Store | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [modelProviders, setModelProviders] = useState<Provider[]>([])
  const [storageProviders, setStorageProviders] = useState<Provider[]>([])
  const [embeddingProviders, setEmbeddingProviders] = useState<Provider[]>([])
  const [ttsProviders, setTtsProviders] = useState<Provider[]>([])
  const [sttProviders, setSttProviders] = useState<Provider[]>([])
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; displayName?: string }>>([])
  const [skills, setSkills] = useState<Array<{ name: string; displayName?: string; state?: string }>>([])
  const [tools, setTools] = useState<Array<{ name: string; type?: string }>>([])
  const [isNewStore, setIsNewStore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [claimDialogOpen, setClaimDialogOpen] = useState(false)

  const isAdmin = isLocalAdminUser(account)
  const isGlobalAdmin = isAdminUser(account)

  const shouldShowClaim =
    store?.owner === "admin" &&
    isChatAdminUser(account) &&
    !isGlobalAdmin

  useEffect(() => {
    if (!owner || !storeName) return
    loadStore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, storeName])

  useEffect(() => {
    if (!account) return
    loadStores()
    loadProviders()
    loadMcpServers()
    loadSkills()
    loadTools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  function loadStore() {
    if (!owner || !storeName) return
    getStore(owner, storeName).then((res) => {
      if (res.status === "ok") {
        const s = res.data as Store
        if (res.data2 && typeof res.data2 === "string" && res.data2 !== "") {
          s.error = res.data2
        }
        setStore(s)
        if (s.owner && s.owner !== owner) {
          navigate(`/stores/${s.owner}/${s.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }

  function loadStores() {
    if (!account) return
    getStores(account.name).then((res) => {
      if (res.status === "ok") setStores(res.data ?? [])
    })
  }

  function loadProviders() {
    if (!account) return
    getProviders(account.name).then((res) => {
      if (res.status === "ok") {
        const all = (res.data ?? []) as Provider[]
        setModelProviders(all.filter((p) => p.category === "Model"))
        setStorageProviders(all.filter((p) => p.category === "Storage"))
        setEmbeddingProviders(all.filter((p) => p.category === "Embedding"))
        setTtsProviders(all.filter((p) => p.category === "Text-to-Speech"))
        setSttProviders(all.filter((p) => p.category === "Speech-to-Text"))
      }
    })
  }

  function loadMcpServers() {
    if (!account) return
    getServers(account.name).then((res) => {
      if (res.status === "ok") setMcpServers(res.data ?? [])
    })
  }

  function loadSkills() {
    if (!account) return
    getSkills(account.name).then((res) => {
      if (res.status === "ok") setSkills(res.data ?? [])
    })
  }

  function loadTools() {
    if (!account) return
    getTools(account.name).then((res) => {
      if (res.status === "ok") setTools(res.data ?? [])
    })
  }

  function update<K extends keyof Store>(key: K, value: Store[K]) {
    setStore((s) => (s ? { ...s, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!store || !owner || !storeName) return
    setSaving(true)
    const payload = { ...store }
    try {
      const res = await updateStore(owner, storeName, payload)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setIsNewStore(false)
        window.dispatchEvent(new Event("storesChanged"))
        if (exit) {
          navigate("/stores")
        } else {
          navigate(`/stores/${store.owner}/${store.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isNewStore && store) {
      deleteStore(store).then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Cancelled successfully"))
          window.dispatchEvent(new Event("storesChanged"))
          navigate("/stores")
        } else {
          toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
        }
      })
    } else {
      navigate("/stores")
    }
  }

  function handleClaim() {
    if (!store) return
    claimStore(store.owner, store.name).then((res) => {
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        window.dispatchEvent(new Event("storesChanged"))
        const s = res.data as Store
        setStore(s)
        navigate(`/stores/${s.owner}/${s.name}`, { replace: true })
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    })
    setClaimDialogOpen(false)
  }

  if (!store) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const providerSelectItems = (providers: Provider[]) =>
    providers.map((p) => (
      <SelectItem key={p.name} value={p.name}>
        <img
          src={getProviderLogoUrl(p)}
          alt={p.name}
          className="h-4 w-4 shrink-0 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
        {getProviderDisplayName(p)} ({p.name})
      </SelectItem>
    ))

  const providerSelectValue = (providers: Provider[], value: string | undefined, placeholder: string) => {
    const provider = providers.find((p) => p.name === value)
    if (!provider) {
      return <span className={value ? undefined : "text-muted-foreground"}>{value || placeholder}</span>
    }

    return (
      <span className="flex min-w-0 items-center gap-2">
        <img
          src={getProviderLogoUrl(provider)}
          alt={provider.name}
          className="h-4 w-4 shrink-0 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
        />
        <span className="truncate">
          {getProviderDisplayName(provider)} ({provider.name})
        </span>
      </span>
    )
  }

  const allStores = stores.filter((s) => s.name !== store.name)
  const skillOptions = skills
    .filter((s) => s.state === "Active")
    .map((s) => ({ label: s.displayName ? `${s.displayName} (${s.name})` : s.name, value: s.name }))
  skillOptions.unshift({ label: i18next.t("store:All"), value: "All" })

  const toolOptions = tools.map((t) => ({ label: t.name, value: t.name }))
  toolOptions.unshift({ label: i18next.t("store:All"), value: "All" })

  const modelProviderOptions = modelProviders.map((p) => ({
    label: `${p.displayName || p.name} (${p.name})`,
    value: p.name,
  }))

  const storeOptions = allStores.map((s) => ({
    label: `${s.displayName} (${s.name})`,
    value: s.name,
  }))

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("store:Edit Store")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewStore && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              {i18next.t("general:Cancel")}
            </Button>
          )}
          {shouldShowClaim && (
            <Button variant="outline" size="sm" onClick={() => setClaimDialogOpen(true)}>
              {i18next.t("store:Claim")}
            </Button>
          )}
        </div>
      </div>

      {/* General Settings */}
      <SectionCard
        title={i18next.t("general:General Settings")}
        desc={i18next.t("general:General Settings desc")}
      >
        <FormField label={i18next.t("general:Owner")} tooltip={i18next.t("general:Owner - Tooltip")}>
          <Input value={store.owner} disabled={!isGlobalAdmin} onChange={(e) => update("owner", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input value={store.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <Input value={store.displayName} onChange={(e) => update("displayName", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Title")} tooltip={i18next.t("general:Title - Tooltip")}>
          <Input value={store.title} onChange={(e) => update("title", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:State")} tooltip={i18next.t("general:State - Tooltip")}>
          <Select value={store.state} onValueChange={(v) => update("state", v ?? "Active")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">{i18next.t("general:Active")}</SelectItem>
              <SelectItem value="Inactive">{i18next.t("general:Inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={i18next.t("general:Avatar")} tooltip={i18next.t("general:Avatar - Tooltip")}>
          <Input value={store.avatar} onChange={(e) => update("avatar", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("store:Is default")} tooltip={i18next.t("store:Is default - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={store.isDefault}
              onCheckedChange={(checked) => update("isDefault", checked)}
            />
          </div>
        </FormField>
        <FormField label={i18next.t("store:Enable extra options")} tooltip={i18next.t("store:Enable extra options - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={store.enableExtraOptions ?? false}
              onCheckedChange={(checked) => update("enableExtraOptions", checked)}
            />
          </div>
        </FormField>
      </SectionCard>

      {/* Providers */}
      <SectionCard
        title={i18next.t("general:Providers")}
        desc={i18next.t("general:Providers desc")}
      >
        {store.enableExtraOptions && (
          <>
            <FormField label={i18next.t("store:Storage provider")} tooltip={i18next.t("store:Storage provider - Tooltip")}>
              <Select value={store.storageProvider || ""} onValueChange={(v) => update("storageProvider", v ?? "")}>
                <SelectTrigger className="w-full">
                  {providerSelectValue(storageProviders, store.storageProvider, i18next.t("general:empty"))}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
                  {providerSelectItems(storageProviders)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={i18next.t("store:Storage subpath")} tooltip={i18next.t("store:Storage subpath - Tooltip")}>
              <Input
                value={store.storageSubpath ?? ""}
                onChange={(e) => update("storageSubpath", e.target.value)}
              />
            </FormField>
            <FormField label={i18next.t("store:Split provider")} tooltip={i18next.t("store:Split provider - Tooltip")}>
              <Select value={store.splitProvider || "Default"} onValueChange={(v) => update("splitProvider", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Default", "Basic", "QA", "Markdown"].map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={i18next.t("store:Search provider")} tooltip={i18next.t("store:Search provider - Tooltip")}>
              <Select value={store.searchProvider || "Default"} onValueChange={(v) => update("searchProvider", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Default", "Hierarchy"].map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </>
        )}
        <FormField label={i18next.t("provider:Model provider")} tooltip={i18next.t("provider:Model provider - Tooltip")}>
          <Select value={store.modelProvider || ""} onValueChange={(v) => update("modelProvider", v ?? "")}>
            <SelectTrigger className="w-full">
              {providerSelectValue(modelProviders, store.modelProvider, i18next.t("general:empty"))}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
              {providerSelectItems(modelProviders)}
            </SelectContent>
          </Select>
        </FormField>
        {store.enableExtraOptions && (
          <>
            <FormField label={i18next.t("store:Embedding provider")} tooltip={i18next.t("store:Embedding provider - Tooltip")}>
              <Select value={store.embeddingProvider || ""} onValueChange={(v) => update("embeddingProvider", v ?? "")}>
                <SelectTrigger className="w-full">
                  {providerSelectValue(embeddingProviders, store.embeddingProvider, i18next.t("general:empty"))}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
                  {providerSelectItems(embeddingProviders)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={i18next.t("store:MCP server")} tooltip={i18next.t("store:MCP server - Tooltip")}>
              <Select value={store.mcpServer || ""} onValueChange={(v) => update("mcpServer", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={i18next.t("general:empty")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
                  {mcpServers.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.displayName || s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={i18next.t("general:Skills")} tooltip={i18next.t("general:Skills - Tooltip")} className="sm:col-span-2">
              <MultiSelect
                value={store.skills ?? []}
                options={skillOptions}
                onChange={(v) => update("skills", v)}
                placeholder={i18next.t("store:Select skills")}
              />
            </FormField>
            <FormField label={i18next.t("general:Tools")} tooltip={i18next.t("general:Tools - Tooltip")} className="sm:col-span-2">
              <MultiSelect
                value={store.tools ?? []}
                options={toolOptions}
                onChange={(v) => update("tools", v)}
                placeholder={i18next.t("store:Select tools")}
              />
            </FormField>
          </>
        )}
        <FormField label={i18next.t("store:Text-to-Speech provider")} tooltip={i18next.t("store:Text-to-Speech provider - Tooltip")}>
          <Select value={store.textToSpeechProvider || ""} onValueChange={(v) => update("textToSpeechProvider", v ?? "")}>
            <SelectTrigger className="w-full">
              {providerSelectValue(ttsProviders, store.textToSpeechProvider, i18next.t("general:empty"))}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
              <SelectItem value="Browser Built-In">Browser Built-In</SelectItem>
              {providerSelectItems(ttsProviders)}
            </SelectContent>
          </Select>
        </FormField>
        {store.enableExtraOptions && (
          <>
            <FormField label={i18next.t("store:Speech-to-Text provider")} tooltip={i18next.t("store:Speech-to-Text provider - Tooltip")}>
              <Select value={store.speechToTextProvider || ""} onValueChange={(v) => update("speechToTextProvider", v ?? "")}>
                <SelectTrigger className="w-full">
                  {providerSelectValue(sttProviders, store.speechToTextProvider, i18next.t("general:empty"))}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{i18next.t("general:empty")}</SelectItem>
                  <SelectItem value="Browser Built-In">Browser Built-In</SelectItem>
                  {providerSelectItems(sttProviders)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={i18next.t("store:Enable TTS streaming")} tooltip={i18next.t("store:Enable TTS streaming - Tooltip")}>
              <div className="flex h-9 items-center">
                <Switch
                  checked={store.enableTtsStreaming ?? false}
                  onCheckedChange={(v) => update("enableTtsStreaming", v)}
                />
              </div>
            </FormField>
          </>
        )}
      </SectionCard>

      {/* Chat */}
      <Card className="mt-4">
        <CardHeader className="border-b pb-4">
          <CardTitle>{i18next.t("general:Chat")}</CardTitle>
          <CardDescription>{i18next.t("general:Chat desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label={i18next.t("store:Welcome")} tooltip={i18next.t("store:Welcome - Tooltip")}>
              <Input value={store.welcome ?? ""} onChange={(e) => update("welcome", e.target.value)} />
            </FormField>
            <FormField label={i18next.t("store:Welcome title")} tooltip={i18next.t("store:Welcome title - Tooltip")}>
              <Input value={store.welcomeTitle ?? ""} onChange={(e) => update("welcomeTitle", e.target.value)} />
            </FormField>
            <FormField label={i18next.t("store:Welcome text")} tooltip={i18next.t("store:Welcome text - Tooltip")}>
              <Input value={store.welcomeText ?? ""} onChange={(e) => update("welcomeText", e.target.value)} />
            </FormField>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <FormField label={i18next.t("store:Prompt")} tooltip={i18next.t("store:Prompt - Tooltip")}>
              <Textarea
                value={store.prompt ?? ""}
                onChange={(e) => update("prompt", e.target.value)}
                className="min-h-24"
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <SectionCard
        title={i18next.t("general:Options")}
        desc={i18next.t("general:Options desc")}
      >
        <FormField label={i18next.t("store:Knowledge count")} tooltip={i18next.t("store:Knowledge count - Tooltip")}>
          <NumberInput
            value={store.knowledgeCount}
            onChange={(v) => update("knowledgeCount", v)}
            min={0}
            max={100}
          />
        </FormField>
        <FormField label={i18next.t("store:Suggestion count")} tooltip={i18next.t("store:Suggestion count - Tooltip")}>
          <NumberInput
            value={store.suggestionCount}
            onChange={(v) => update("suggestionCount", v)}
            min={0}
            max={10}
          />
        </FormField>
        <FormField label={i18next.t("store:Memory limit")} tooltip={i18next.t("store:Memory limit - Tooltip")}>
          <NumberInput value={store.memoryLimit} onChange={(v) => update("memoryLimit", v)} min={0} />
        </FormField>
        {store.enableExtraOptions && (
          <>
            <FormField label={i18next.t("store:Frequency")} tooltip={i18next.t("store:Frequency - Tooltip")}>
              <NumberInput value={store.frequency} onChange={(v) => update("frequency", v)} min={0} />
            </FormField>
            <FormField label={i18next.t("store:Limit minutes")} tooltip={i18next.t("store:Limit minutes - Tooltip")}>
              <NumberInput value={store.limitMinutes} onChange={(v) => update("limitMinutes", v)} min={0} />
            </FormField>
            <FormField label={i18next.t("store:Vector stores")} tooltip={i18next.t("store:Vector stores - Tooltip")} className="sm:col-span-2">
              <TagInput
                value={store.vectorStores ?? []}
                onChange={(v) => update("vectorStores", v)}
                suggestions={allStores.map((s) => s.name)}
                placeholder={i18next.t("store:Vector stores")}
              />
            </FormField>
            <FormField label={i18next.t("store:Child stores")} tooltip={i18next.t("store:Child stores - Tooltip")} className="sm:col-span-2">
              <TagInput
                value={store.childStores ?? []}
                onChange={(v) => update("childStores", v)}
                suggestions={allStores.map((s) => s.name)}
                placeholder={i18next.t("store:Child stores")}
              />
            </FormField>
          </>
        )}
        <FormField label={i18next.t("store:Child model providers")} tooltip={i18next.t("store:Child model providers - Tooltip")} className="sm:col-span-2">
          <TagInput
            value={store.childModelProviders ?? []}
            onChange={(v) => update("childModelProviders", v)}
            suggestions={modelProviders.map((p) => p.name)}
            placeholder={i18next.t("store:Child model providers")}
          />
        </FormField>
        <FormField label={i18next.t("store:Forbidden words")} tooltip={i18next.t("store:Forbidden words - Tooltip")} className="sm:col-span-2">
          <TagInput
            value={store.forbiddenWords ?? []}
            onChange={(v) => update("forbiddenWords", v)}
            placeholder={i18next.t("store:Forbidden words")}
          />
        </FormField>
        <FormField label={i18next.t("store:Show auto read")} tooltip={i18next.t("store:Show auto read - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={store.showAutoRead ?? false}
              onCheckedChange={(v) => update("showAutoRead", v)}
            />
          </div>
        </FormField>
        <FormField label={i18next.t("store:Disable file upload")} tooltip={i18next.t("store:Disable file upload - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={store.disableFileUpload ?? false}
              onCheckedChange={(v) => update("disableFileUpload", v)}
            />
          </div>
        </FormField>
        <FormField label={i18next.t("store:Hide thinking")} tooltip={i18next.t("store:Hide thinking - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={store.hideThinking ?? false}
              onCheckedChange={(v) => update("hideThinking", v)}
            />
          </div>
        </FormField>
      </SectionCard>

      {/* Bottom action bar */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewStore && (
          <Button variant="outline" onClick={handleCancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
        {shouldShowClaim && (
          <Button variant="outline" onClick={() => setClaimDialogOpen(true)}>
            {i18next.t("store:Claim")}
          </Button>
        )}
      </div>

      {/* Claim dialog */}
      <AlertDialog open={claimDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("store:Claim")}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18next.t("store:Claim")} {store.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClaimDialogOpen(false)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleClaim}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
