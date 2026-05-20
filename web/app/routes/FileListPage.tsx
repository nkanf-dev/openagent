// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useStoreFilter } from "~/hooks/useStoreFilter"
import {
  EditIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type File as FileItem, deleteFile, getFiles, refreshFileVectors, uploadFile } from "~/backend/FileBackend"
import { isLocalAdminUser } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useDeclareStoreFilter } from "~/context/StoreFilterContext"

export function meta() {
  return [{ title: "Files — OpenAgent" }]
}

type Pagination = { current: number; pageSize: number; total: number }

function getFormattedSize(size: number | undefined): string {
  if (size === undefined || size === null) return "-"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

type SearchField = "store" | "name" | "filename" | "storageProvider" | "status" | "errorText"

export default function FileListPage() {
  useDeclareStoreFilter(true)
  const navigate = useNavigate()
  const { account } = useAccount()
  const storeFilter = useStoreFilter()
  const isAdmin = isLocalAdminUser(account)

  const [files, setFiles] = useState<FileItem[]>([])
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [searchField, setSearchField] = useState<SearchField>("name")
  const [searchValue, setSearchValue] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(() => {
    setLoading(true)
    getFiles("admin", storeFilter ?? "")
      .then((res) => {
        if (res.status === "ok") {
          const data: FileItem[] = res.data ?? []
          setFiles(data)
          setFilteredFiles(data)
          setPagination((p) => ({ ...p, current: 1, total: data.length }))
          setSelectedNames(new Set())
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [storeFilter])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  function handleSearch() {
    if (!searchValue.trim()) {
      setFilteredFiles(files)
      setPagination((p) => ({ ...p, current: 1, total: files.length }))
      return
    }
    const val = searchValue.toLowerCase()
    const filtered = files.filter((f) => {
      const fieldValue = String((f as any)[searchField] ?? "").toLowerCase()
      return fieldValue.includes(val)
    })
    setFilteredFiles(filtered)
    setPagination((p) => ({ ...p, current: 1, total: filtered.length }))
  }

  function handleDelete(file: FileItem) {
    deleteFile(file)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setFiles((prev) => prev.filter((f) => f.name !== file.name))
          setFilteredFiles((prev) => prev.filter((f) => f.name !== file.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
          setSelectedNames((prev) => {
            const next = new Set(prev)
            next.delete(file.name)
            return next
          })
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleBulkDelete() {
    const toDelete = filteredFiles.filter((f) => selectedNames.has(f.name))
    Promise.all(toDelete.map((f) => deleteFile(f)))
      .then(() => {
        toast.success(i18next.t("general:Successfully deleted"))
        const deletedNames = new Set(toDelete.map((f) => f.name))
        setFiles((prev) => prev.filter((f) => !deletedNames.has(f.name)))
        setFilteredFiles((prev) => prev.filter((f) => !deletedNames.has(f.name)))
        setPagination((p) => ({ ...p, total: Math.max(0, p.total - toDelete.length) }))
        setSelectedNames(new Set())
      })
      .catch((err: Error) => toast.error(err.message))
    setBulkDeleteOpen(false)
  }

  function handleRefreshVectors(file: FileItem) {
    setRefreshing((prev) => ({ ...prev, [file.name]: true }))
    refreshFileVectors(file)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Vectors generated successfully"))
          fetchFiles()
        } else {
          toast.error(`${i18next.t("general:Vectors failed to generate")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setRefreshing((prev) => ({ ...prev, [file.name]: false })))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploading(true)
    const storeName = storeFilter || "store-built-in"
    uploadFile(`admin/${storeName}`, file)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully uploaded"))
          fetchFiles()
        } else {
          toast.error(res.msg)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setUploading(false))
  }

  function toggleSelect(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleSelectAll() {
    const pageItems = getCurrentPageItems()
    if (pageItems.every((f) => selectedNames.has(f.name)) && pageItems.length > 0) {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        pageItems.forEach((f) => next.delete(f.name))
        return next
      })
    } else {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        pageItems.forEach((f) => next.add(f.name))
        return next
      })
    }
  }

  function getCurrentPageItems(): FileItem[] {
    const start = (pagination.current - 1) * pagination.pageSize
    return filteredFiles.slice(start, start + pagination.pageSize)
  }

  const pageItems = getCurrentPageItems()
  const allPageSelected = pageItems.length > 0 && pageItems.every((f) => selectedNames.has(f.name))
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.yaml,.csv,.pdf,.docx,.xlsx,.pptx"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Files")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(v) => setSearchField((v ?? "name") as SearchField)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">{i18next.t("general:Store")}</SelectItem>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="filename">{i18next.t("file:Filename")}</SelectItem>
              <SelectItem value="storageProvider">{i18next.t("store:Storage provider")}</SelectItem>
              <SelectItem value="status">{i18next.t("general:Status")}</SelectItem>
              <SelectItem value="errorText">{i18next.t("message:Error text")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch() }}
            />
          </div>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <UploadIcon className="h-4 w-4" />
            )}
            {i18next.t("general:Upload")}
          </Button>
          {selectedNames.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selectedNames.size})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </TableHead>
              <TableHead className="w-32">{i18next.t("general:Store")}</TableHead>
              <TableHead className="w-40">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-48">{i18next.t("file:Filename")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:Size")}</TableHead>
              <TableHead className="w-40">{i18next.t("store:Storage provider")}</TableHead>
              <TableHead className="w-28">{i18next.t("chat:Token count")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:Status")}</TableHead>
              <TableHead className="w-48">{i18next.t("message:Error text")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((file) => (
                <TableRow key={file.name}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedNames.has(file.name)}
                      onChange={() => toggleSelect(file.name)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    {file.store ? (
                      <Link
                        to={`/stores/${file.owner ?? "admin"}/${file.store}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {file.store}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/files/${encodeURIComponent(file.name)}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {file.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{file.filename ?? "-"}</TableCell>
                  <TableCell className="text-sm">{getFormattedSize(file.size)}</TableCell>
                  <TableCell>
                    {file.storageProvider ? (
                      <Link
                        to={`/providers/${file.storageProvider}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {file.storageProvider}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{file.tokenCount ?? "-"}</TableCell>
                  <TableCell>
                    <StatusBadge status={file.status} />
                  </TableCell>
                  <TableCell>
                    {file.errorText ? (
                      <Tooltip>
                        <TooltipTrigger className="max-w-[180px] truncate text-sm text-destructive cursor-default text-left">
                          <span dangerouslySetInnerHTML={{ __html: file.errorText }} />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[400px] whitespace-pre-wrap break-words text-xs">
                          <span dangerouslySetInnerHTML={{ __html: file.errorText }} />
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={i18next.t("general:View")}
                        onClick={() => navigate(`/files/${encodeURIComponent(file.name)}`)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={i18next.t("general:Delete")}
                        onClick={() => setDeleteTarget(file)}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <MoreHorizontalIcon className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRefreshVectors(file)}
                              disabled={!!refreshing[file.name]}
                            >
                              {refreshing[file.name] ? (
                                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCwIcon className="mr-2 h-4 w-4" />
                              )}
                              {i18next.t("general:Refresh Vectors")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => {
                const size = Number(v ?? "10")
                setPagination((p) => ({ ...p, current: 1, pageSize: size }))
              }}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100", "1000"].map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => setPagination((p) => ({ ...p, current: p.current - 1 }))}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => setPagination((p) => ({ ...p, current: p.current + 1 }))}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete single */}
      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18next.t("general:Sure to delete")}: {selectedNames.size} {i18next.t("general:items")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-sm text-muted-foreground">-</span>

  let cls = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
  if (status === "Complete") {
    cls += " bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
  } else if (status === "Processing") {
    cls += " bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
  } else if (status === "Pending") {
    cls += " bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
  } else if (status === "Error") {
    cls += " bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  } else {
    cls += " bg-muted text-muted-foreground"
  }

  return <span className={cls}>{status}</span>
}
