import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useStoreFilter } from "~/hooks/useStoreFilter"
import { EditIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isLocalAdminUser } from "~/backend/AccountBackend"
import {
  addProvider,
  deleteProvider,
  getProviderDisplayName,
  getProviderLogoUrl,
  getProviders,
  getProviderUrl,
  type Provider,
} from "~/backend/ProviderBackend"
import { useAccount } from "~/context/AccountContext"
import { getProviderTypeOptions } from "~/lib/ProviderSetting"
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
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useDeclareStoreFilter } from "~/context/StoreFilterContext"

export function meta() {
  return [{ title: "Providers - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

const CATEGORIES = [
  "Model",
  "Embedding",
  "Storage",
  "Agent",
  "Blockchain",
  "Video",
  "Text-to-Speech",
  "Speech-to-Text",
]

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

function newProvider(ownerName: string): Provider {
  const rand = randomName()
  return {
    owner: ownerName || "admin",
    name: `provider_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Provider - ${rand}`,
    displayName2: "",
    category: "Model",
    type: "OpenAI",
    subType: "text-davinci-003",
    clientId: "",
    clientSecret: "",
    mcpTools: [],
    enableThinking: false,
    temperature: 1,
    topP: 1,
    topK: 4,
    frequencyPenalty: 0,
    presencePenalty: 0,
    inputPricePerThousandTokens: 0,
    outputPricePerThousandTokens: 0,
    currency: "USD",
    providerUrl: "",
    apiVersion: "",
    apiKey: "",
    network: "",
    userKey: "",
    userCert: "",
    signKey: "",
    signCert: "",
    compatibleProvider: "",
    contractName: "",
    contractMethod: "",
    state: "Active",
    isRemote: false,
  }
}

function ProviderLogoCell({ provider }: { provider: Provider }) {
  const url = getProviderUrl(provider)
  const img = (
    <img
      src={getProviderLogoUrl(provider)}
      alt={provider.type}
      className="mx-auto h-8 w-8 object-contain"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).src = "https://cdn.openagentai.org/img/social_default.png"
      }}
    />
  )
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex">
              {img}
            </a>
          ) : img}
        </span>
      </TooltipTrigger>
      <TooltipContent>{provider.type}</TooltipContent>
    </Tooltip>
  )
}

export default function ProviderListPage() {
  useDeclareStoreFilter(true)
  const navigate = useNavigate()
  const { account } = useAccount()
  const storeFilter = useStoreFilter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const isAdmin = isLocalAdminUser(account)

  const fetchProviders = useCallback(
    (params: {
      current?: number
      pageSize?: number
      sortField?: string
      sortOrder?: SortOrder
      field?: string
      value?: string
    } = {}) => {
      const current = params.current ?? pagination.current
      const pageSize = params.pageSize ?? pagination.pageSize
      const sf = params.sortField ?? sortField
      const so = params.sortOrder ?? sortOrder
      const field = params.field ?? searchField
      const value = params.value ?? searchValue
      setLoading(true)
      getProviders(account?.name || "admin", storeFilter ?? "", String(current), String(pageSize), field, value, sf, so)
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            setProviders(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
            setSelected([])
          } else {
            toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => {
          setLoading(false)
          toast.error(err.message)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.name, pagination, searchField, searchValue, sortField, sortOrder, storeFilter]
  )

  useEffect(() => {
    fetchProviders({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.name, storeFilter])

  function handleAdd() {
    const provider = newProvider(account?.name || "admin")
    addProvider(provider)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/providers/${provider.name}`, { state: { isNewProvider: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(provider: Provider) {
    deleteProvider(provider)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setProviders((prev) => prev.filter((p) => p.name !== provider.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    const targets = providers.filter((p) => selected.includes(p.name) && !p.isRemote)
    for (const provider of targets) {
      const res = await deleteProvider(provider)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${provider.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setProviders((prev) => prev.filter((p) => !targets.some((t) => t.name === p.name)))
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - targets.length) }))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  function applySearch() {
    fetchProviders({ current: 1, field: searchField, value: searchValue })
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const typeOptions = CATEGORIES.flatMap((c) => getProviderTypeOptions(c).map((o: any) => o.name))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Providers")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(v) => setSearchField(v ?? "name")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="displayName">{i18next.t("general:Display name")}</SelectItem>
              <SelectItem value="category">{i18next.t("general:Category")}</SelectItem>
              <SelectItem value="type">{i18next.t("general:Type")}</SelectItem>
              <SelectItem value="subType">{i18next.t("provider:Sub type")}</SelectItem>
              <SelectItem value="clientId">{i18next.t("provider:Client ID")}</SelectItem>
            </SelectContent>
          </Select>
          {searchField === "category" ? (
            <Select value={searchValue} onValueChange={(v) => setSearchValue(v ?? "")}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder={i18next.t("general:Category")} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : searchField === "type" ? (
            <Select value={searchValue} onValueChange={(v) => setSearchValue(v ?? "")}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue placeholder={i18next.t("general:Type")} />
              </SelectTrigger>
              <SelectContent>
                {[...new Set(typeOptions)].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 w-52"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySearch() }}
            />
          )}
          <Button variant="outline" size="sm" onClick={applySearch}>
            {i18next.t("general:Search")}
          </Button>
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selected.length})
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={handleAdd}>
              <PlusIcon className="h-4 w-4" />
              {i18next.t("general:Add")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={providers.length > 0 && selected.length === providers.length}
                  onCheckedChange={(checked) => setSelected(checked ? providers.map((p) => p.name) : [])}
                />
              </TableHead>
              <TableHead className="w-44">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-56">{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-36">{i18next.t("general:Category")}</TableHead>
              <TableHead className="w-24 text-center">{i18next.t("general:Type")}</TableHead>
              <TableHead className="w-48">{i18next.t("provider:Sub type")}</TableHead>
              <TableHead className="w-60">{i18next.t("provider:Client ID")}</TableHead>
              <TableHead className="w-28">{i18next.t("store:Is default")}</TableHead>
              <TableHead className="w-28">{i18next.t("provider:Is remote")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:State")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : providers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : providers.map((provider) => {
              const editLabel = provider.isRemote ? i18next.t("general:View") : i18next.t("general:Edit")
              return (
                <TableRow key={provider.name}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(provider.name)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked ? [...prev, provider.name] : prev.filter((n) => n !== provider.name)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Link to={`/providers/${provider.name}`} className="text-sm font-medium text-primary hover:underline">
                      {provider.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{getProviderDisplayName(provider)}</TableCell>
                  <TableCell className="text-sm">{provider.category}</TableCell>
                  <TableCell className="text-center"><ProviderLogoCell provider={provider} /></TableCell>
                  <TableCell className="text-sm">{provider.subType}</TableCell>
                  <TableCell className="max-w-60 truncate text-sm" title={provider.clientId}>{provider.clientId}</TableCell>
                  <TableCell><Switch checked={!!provider.isDefault} disabled size="sm" /></TableCell>
                  <TableCell><Switch checked={!!provider.isRemote} disabled size="sm" /></TableCell>
                  <TableCell>
                    <Badge variant={provider.state === "Active" ? "default" : "destructive"}>
                      {provider.state === "Active" ? i18next.t("general:Active") : i18next.t("general:Inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={editLabel}
                        onClick={() => navigate(`/providers/${provider.name}`)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={i18next.t("general:Delete")}
                          disabled={provider.isRemote}
                          onClick={() => setDeleteTarget(provider)}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={pagination.current <= 1} onClick={() => fetchProviders({ current: pagination.current - 1 })}>
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pagination.current >= totalPages} onClick={() => fetchProviders({ current: pagination.current + 1 })}>
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.length} {i18next.t("general:items")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
