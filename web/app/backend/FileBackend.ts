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

import { apiFetch, apiPost, ServerUrl, getAcceptLanguage } from "~/lib/api"

export type File = {
  owner: string
  name: string
  createdTime?: string
  filename?: string
  size?: number
  store?: string
  storageProvider?: string
  tokenCount?: number
  status?: string
  errorText?: string
}

export function getFiles(owner: string, store = ""): Promise<any> {
  return apiFetch(`/api/get-files?owner=${owner}&store=${store}`)
}

export function getFile(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-file?id=${owner}/${encodeURIComponent(name)}`)
}

export function updateFile(owner: string, name: string, file: File): Promise<any> {
  return apiPost(`/api/update-file?id=${owner}/${encodeURIComponent(name)}`, file)
}

export function addFile(file: File): Promise<any> {
  return apiPost("/api/add-file", file)
}

export function deleteFile(file: File): Promise<any> {
  return apiPost("/api/delete-file", file)
}

export function refreshFileVectors(file: File): Promise<any> {
  return apiPost("/api/refresh-file-vectors", file)
}

export function uploadFile(storeId: string, file: globalThis.File): Promise<any> {
  const formData = new FormData()
  formData.append("file", file)
  return fetch(`${ServerUrl}/api/upload-file?store=${encodeURIComponent(storeId)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": getAcceptLanguage(),
    },
    body: formData,
  }).then(async (res) => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { status: "error", msg: text }
    }
  })
}

export function updateFileContent(owner: string, name: string, file: globalThis.File): Promise<any> {
  const formData = new FormData()
  formData.append("file", file)
  return fetch(`${ServerUrl}/api/update-file-content?id=${encodeURIComponent(owner + "/" + name)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": getAcceptLanguage(),
    },
    body: formData,
  }).then(async (res) => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { status: "error", msg: text }
    }
  })
}
