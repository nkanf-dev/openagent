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

import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Loader2Icon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type File as FileItem, deleteFile, getFile, refreshFileVectors, updateFile, updateFileContent } from "~/backend/FileBackend"
import { getStores, type Store } from "~/backend/StoreBackend"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit File — OpenAgent" }]
}

function getFormattedSize(size: number | undefined): string {
  if (size === undefined || size === null) return "-"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function getFormattedDate(dateStr: string | undefined): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

export default function FileEditPage() {
  const { fileName } = useParams<{ fileName: string }>()
  const navigate = useNavigate()

  const [file, setFile] = useState<FileItem | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!fileName) return
    getFile("admin", fileName).then((res) => {
      if (res.data === null) {
        navigate("/404")
        return
      }
      if (res.status === "ok") {
        setFile(res.data as FileItem)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [fileName, navigate])

  useEffect(() => {
    getStores("admin").then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) {
        setStores(res.data)
      }
    })
  }, [])

  function update<K extends keyof FileItem>(key: K, value: FileItem[K]) {
    setFile((f) => (f ? { ...f, [key]: value } : null))
  }

  async function save() {
    if (!file || !fileName) return
    setSaving(true)
    try {
      const res = await updateFile(file.owner, fileName, file)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!file) return
    const res = await deleteFile(file)
    if (res.status === "ok") {
      toast.success(i18next.t("general:Successfully deleted"))
      navigate("/files")
    } else {
      toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
    }
  }

  async function handleRefreshVectors() {
    if (!file) return
    setRefreshing(true)
    try {
      const res = await refreshFileVectors(file)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully refreshed"))
      } else {
        toast.error(`${i18next.t("general:Failed to refresh")}: ${res.msg}`)
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function handleUpdateContent(e: React.ChangeEvent<HTMLInputElement>) {
    if (!file || !fileName) return
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setUpdating(true)
    try {
      const res = await updateFileContent(file.owner, fileName, selectedFile)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully updated"))
        getFile("admin", fileName).then((r) => {
          if (r.status === "ok") setFile(r.data as FileItem)
        })
      } else {
        toast.error(`${i18next.t("general:Failed to update")}: ${res.msg}`)
      }
    } finally {
      setUpdating(false)
      e.target.value = ""
    }
  }

  if (!file) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {i18next.t("general:Edit File")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { save().then(() => navigate("/files")) }} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
        </div>
      </div>

      {/* File Info */}
      <SectionCard
        title={i18next.t("general:File Info")}
        desc={i18next.t("general:File Info desc")}
      >
        <FormField label={i18next.t("general:Name")}>
          <Input value={file.name} disabled className="bg-muted" />
        </FormField>
        <FormField label={i18next.t("file:Filename")}>
          <Input value={file.filename ?? ""} onChange={(e) => update("filename", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Store")}>
          <Select value={file.store ?? ""} onValueChange={(v) => update("store", v)}>
            <SelectTrigger>
              <SelectValue placeholder={i18next.t("general:Select a store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  <span className="flex items-center gap-1.5">
                    {s.avatar ? (
                      <img
                        src={s.avatar}
                        alt=""
                        className="h-4 w-4 rounded object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    ) : null}
                    <span className="truncate">{s.displayName || s.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={i18next.t("general:Size")}>
          <Input value={getFormattedSize(file.size)} disabled className="bg-muted" />
        </FormField>
        <FormField label={i18next.t("general:Storage Provider")}>
          <Input value={file.storageProvider ?? ""} disabled className="bg-muted" />
        </FormField>
        <FormField label={i18next.t("general:Created Time")}>
          <Input value={getFormattedDate(file.createdTime)} disabled className="bg-muted" />
        </FormField>
        <FormField label={i18next.t("general:Token Count")}>
          <Input value={String(file.tokenCount ?? 0)} disabled className="bg-muted" />
        </FormField>
        <FormField label={i18next.t("general:Status")}>
          <Input value={file.status ?? ""} disabled className="bg-muted" />
        </FormField>
      </SectionCard>

      {/* Actions */}
      <SectionCard title={i18next.t("general:Actions")}>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRefreshVectors()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="mr-2 h-4 w-4" />
            )}
            {i18next.t("general:Refresh Vectors")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.yaml,.csv,.pdf,.docx,.xlsx,.pptx"
            onChange={handleUpdateContent}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={updating}
            onClick={() => fileInputRef.current?.click()}
          >
            {updating ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadIcon className="mr-2 h-4 w-4" />
            )}
            {i18next.t("general:Update File Content")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {i18next.t("general:Delete")}
          </Button>
        </div>
      </SectionCard>

      {/* Bottom action bar */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save()} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => { save().then(() => navigate("/files")) }} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18next.t("general:Delete")} {file.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
