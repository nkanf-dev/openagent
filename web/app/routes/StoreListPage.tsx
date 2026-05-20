import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  CheckIcon,
  CopyIcon,
  EditIcon,
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isLocalAdminUser } from "~/backend/AccountBackend"
import {
  type Store,
  addStore,
  deleteStore,
  getGlobalStores,
  refreshStoreVectors,
} from "~/backend/StoreBackend"
import { getProviderLogoUrl, getProviders, type Provider } from "~/backend/ProviderBackend"
import { useAccount } from "~/context/AccountContext"
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
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

export function meta() {
  return [{ title: "Stores — OpenAgent" }]
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={copied ? i18next.t("general:Copied") : i18next.t("general:Copy Link")}
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          toast.success(i18next.t("general:Successfully copied"))
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }).catch(() => {
          toast.error(i18next.t("general:Failed to copy to clipboard"))
        })
      }}
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
    </Button>
  )
}

const DEFAULT_AVATAR = "https://cdn.openagentai.org/img/chat/ai.png"
const DEFAULT_PROMPT =
  "You are an expert in your field and you specialize in using your knowledge to answer or solve people's problems."

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

function newStore(ownerName: string): Store {
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    owner: ownerName,
    name: `store_${rand}`,
    displayName: `New Store - ${rand}`,
    createdTime: new Date().toISOString(),
    title: `Title - ${rand}`,
    avatar: DEFAULT_AVATAR,
    storageProvider: "provider-storage-built-in",
    storageSubpath: `store_${rand}`,
    modelProvider: "",
    textToSpeechProvider: "Browser Built-In",
    speechToTextProvider: "Browser Built-In",
    memoryLimit: 5,
    frequency: 10000,
    limitMinutes: 10,
    welcome: "Hello",
    welcomeTitle: i18next.t("chat:Hello, I'm OpenAgent AI Assistant"),
    welcomeText: i18next.t("chat:I'm here to help answer your questions"),
    prompt: DEFAULT_PROMPT,
    knowledgeCount: 5,
    suggestionCount: 3,
    skills: ["All"],
    tools: ["All"],
    isDefault: false,
    state: "Active",
    enableExtraOptions: false,
  }
}

export default function StoreListPage() {
  const navigate = useNavigate()
  const { account } = useAccount()
  const [stores, setStores] = useState<Store[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("")
  const [searchValue, setSearchValue] = useState("")
  const [hideChat, setHideChat] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("hideChat") ?? "false") === true }
    catch { return false }
  })
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null)
  const [providers, setProviders] = useState<Record<string, Provider>>({})

  const isAdmin = isLocalAdminUser(account)

  const fetch = useCallback(
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
      getGlobalStores("", String(current), String(pageSize), field, value, sf, so)
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            setStores(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
          } else {
            toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => {
          setLoading(false)
          toast.error(err.message)
        })
    },
    [pagination, sortField, sortOrder, searchField, searchValue]
  )

  useEffect(() => {
    fetch({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!account) return

    getProviders(account.name).then((res) => {
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        return
      }

      const providerMap: Record<string, Provider> = {}
      ;((res.data ?? []) as Provider[]).forEach((provider) => {
        providerMap[provider.name] = provider
      })
      setProviders(providerMap)
    })
  }, [account])

  function handleAddStore() {
    if (!account) return
    const s = newStore(account.name)
    addStore(s)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          window.dispatchEvent(new Event("storesChanged"))
          navigate(`/stores/${s.owner}/${s.name}`)
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(store: Store) {
    deleteStore(store)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          window.dispatchEvent(new Event("storesChanged"))
          setStores((prev) => prev.filter((s) => s.name !== store.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleRefreshVectors(store: Store) {
    setGenerating((g) => ({ ...g, [store.name]: true }))
    refreshStoreVectors(store)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Vectors generated successfully"))
        } else {
          toast.error(`${i18next.t("general:Vectors failed to generate")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setGenerating((g) => ({ ...g, [store.name]: false })))
  }

  function handleHideChat(checked: boolean) {
    setHideChat(checked)
    localStorage.setItem("hideChat", JSON.stringify(checked))
  }

  function renderProviderInfo(providerName?: string) {
    if (!providerName) {
      return <span className="text-sm text-muted-foreground">-</span>
    }

    const provider = providers[providerName]
    if (!provider) {
      return (
        <Link to={`/providers/${providerName}`} className="text-sm text-primary hover:underline">
          {providerName}
        </Link>
      )
    }

    return (
      <Link
        to={`/providers/${provider.name}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <img
          src={getProviderLogoUrl(provider)}
          alt={provider.name}
          className="h-5 w-5 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
        />
        {provider.name}
      </Link>
    )
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Stores")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
            {i18next.t("store:Hide chat")}
            <Switch checked={hideChat} onCheckedChange={handleHideChat} size="sm" />
          </label>
          {isAdmin && (
            <Button size="sm" onClick={handleAddStore}>
              <PlusIcon className="h-4 w-4" />
              {i18next.t("general:Add")}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">{i18next.t("general:Owner")}</TableHead>
              <TableHead className="w-32">{i18next.t("general:Name")}</TableHead>
              <TableHead>{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-16 text-center">{i18next.t("general:Avatar")}</TableHead>
              <TableHead className="w-24">{i18next.t("store:Is default")}</TableHead>
              {!hideChat && (
                <>
                  <TableHead className="w-24">{i18next.t("store:Chat count")}</TableHead>
                  <TableHead className="w-28">{i18next.t("chat:Message count")}</TableHead>
                  <TableHead className="w-24">{i18next.t("store:Vector count")}</TableHead>
                  <TableHead className="w-72">{i18next.t("provider:Model provider")}</TableHead>
                </>
              )}
              <TableHead className="w-20">{i18next.t("general:State")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={hideChat ? 6 : 10} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : stores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={hideChat ? 6 : 10} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              stores.map((store) => (
                <TableRow key={store.name}>
                  <TableCell className="text-sm">{store.owner}</TableCell>
                  <TableCell>
                    <Link
                      to={`/stores/${store.owner}/${store.name}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {store.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{store.displayName}</TableCell>
                  <TableCell className="text-center">
                    <Avatar className="mx-auto h-8 w-8">
                      <AvatarImage src={store.avatar || DEFAULT_AVATAR} alt={store.name} />
                      <AvatarFallback>{store.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <Switch checked={store.isDefault} disabled size="sm" />
                  </TableCell>
                  {!hideChat && (
                    <>
                      <TableCell>
                        <Link
                          to={`/stores/${store.owner}/${store.name}/chats`}
                          className="text-sm text-primary hover:underline"
                        >
                          {store.chatCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/stores/${store.owner}/${store.name}/messages`}
                          className="text-sm text-primary hover:underline"
                        >
                          {store.messageCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/stores/${store.owner}/${store.name}/vectors`}
                          className="text-sm text-primary hover:underline"
                        >
                          {store.vectorCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {renderProviderInfo(store.modelProvider)}
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    <Badge variant={store.state === "Active" ? "default" : "destructive"}>
                      {store.state === "Active"
                        ? i18next.t("general:Active")
                        : i18next.t("general:Inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Edit")}
                          onClick={() => navigate(`/stores/${store.owner}/${store.name}`)}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={i18next.t("general:Files")}
                        onClick={() => navigate(`/stores/${store.owner}/${store.name}/view`)}
                      >
                        <FileIcon className="h-3.5 w-3.5" />
                      </Button>
                      {!hideChat && (
                        <>
                          <CopyLinkButton url={`${window.location.origin}/${store.owner}/${store.name}/chat`} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={i18next.t("store:Open Chat")}
                            onClick={() => {
                              window.open(
                                `${window.location.origin}/${store.owner}/${store.name}/chat`,
                                "_blank"
                              )
                            }}
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Refresh Vectors")}
                          disabled={generating[store.name]}
                          onClick={() => handleRefreshVectors(store)}
                        >
                          {generating[store.name] ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={i18next.t("general:Delete")}
                          disabled={store.isDefault}
                          onClick={() => setDeleteTarget(store)}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => fetch({ current: pagination.current - 1 })}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">
              {pagination.current} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => fetch({ current: pagination.current + 1 })}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
