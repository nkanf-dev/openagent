import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { SendHorizontalIcon, SquareIcon, XIcon, GlobeIcon, MicIcon, MicOffIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import ChatFileInput from "~/components/chat/ChatFileInput"
import ChatInputMenu from "~/components/chat/ChatInputMenu"
import type { Store } from "~/backend/StoreBackend"
import type { Chat } from "~/backend/ChatBackend"

type UploadedFile = {
  uid: number
  file: File
  content: string
  value: string
}

type Props = {
  value: string
  store?: Store
  chat?: Chat
  files: UploadedFile[]
  onFileChange: (files: UploadedFile[]) => void
  onChange: (value: string) => void
  onSend: (value: string, webSearchEnabled: boolean) => void
  loading?: boolean
  disableInput?: boolean
  messageError?: boolean
  onCancelMessage?: () => void
  onVoiceInputStart?: () => void
  onVoiceInputEnd?: () => void
  isVoiceInput?: boolean
  webSearchEnabled: boolean
  onWebSearchChange: (enabled: boolean) => void
}

export type ChatInputHandle = {
  focus: () => void
}

const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  {
    value,
    store,
    chat,
    files,
    onFileChange,
    onChange,
    onSend,
    loading,
    disableInput,
    messageError,
    onCancelMessage,
    onVoiceInputStart,
    onVoiceInputEnd,
    isVoiceInput,
    webSearchEnabled,
    onWebSearchChange,
  },
  ref
) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [value])

  const canSend = !messageError && !loading && (value.trim() !== "" || files.length > 0) && !disableInput

  const handleFileUploadClick = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*, .txt, .md, .yaml, .csv, .docx, .pdf, .xlsx"
    input.multiple = false
    input.style.display = "none"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) processFile(file)
    }
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }, [files])

  function processFile(file: File) {
    const reader = new FileReader()
    if (file.type.startsWith("image/")) {
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const maxWidth = 600
          const ratio = img.width > maxWidth ? maxWidth / img.width : 1
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          const imgValue = `<img src="${img.src}" alt="${file.name}" width="${w}" height="${h}">`
          addFile(file, img.src, imgValue)
        }
        img.src = e.target!.result as string
      }
    } else {
      reader.onload = (e) => {
        const dataUrl = e.target!.result as string
        const fileValue = `<a href="${dataUrl}" target="_blank">${file.name}</a>`
        addFile(file, fileValue, dataUrl)
      }
    }
    reader.readAsDataURL(file)
  }

  function addFile(file: File, content: string, fileValue: string) {
    onFileChange([
      ...files,
      { uid: Date.now() + Math.random(), file, content, value: fileValue },
    ])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) {
        onSend(value, webSearchEnabled)
      }
    }
  }

  return (
    <div className="bg-background px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* File previews */}
        {files.length > 0 && (
          <div className="mb-2">
            <ChatFileInput files={files} onFileChange={onFileChange} />
          </div>
        )}

        {/* Web search badge */}
        {webSearchEnabled && (
          <div className="mb-2">
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
              <GlobeIcon className="h-3 w-3" />
              {t("chat:Web search")}
              <button
                className="ml-0.5 rounded-full opacity-60 hover:opacity-100"
                onClick={() => onWebSearchChange(false)}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* Input shell */}
        <div className="bg-background flex items-end gap-2 rounded-2xl border px-3 py-2 shadow-sm transition-colors focus-within:border-ring/60 focus-within:shadow-md">
          {/* Left: attachment menu */}
          <ChatInputMenu
            disabled={!!(disableInput || messageError)}
            webSearchEnabled={webSearchEnabled}
            onWebSearchChange={onWebSearchChange}
            onFileUpload={handleFileUploadClick}
            disableFileUpload={store?.disableFileUpload}
            store={store}
            chat={chat}
          />

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={messageError ? "" : t("chat:Type message here")}
            disabled={disableInput}
            className="min-h-[32px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-[32px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            rows={1}
          />

          {/* Right: voice + send/stop */}
          <div className="flex shrink-0 items-center gap-1">
            {(onVoiceInputStart || onVoiceInputEnd) && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-lg ${isVoiceInput ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}
                onClick={isVoiceInput ? onVoiceInputEnd : onVoiceInputStart}
              >
                {isVoiceInput ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
              </Button>
            )}

            {loading ? (
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onCancelMessage}
              >
                <SquareIcon className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={!canSend}
                onClick={() => { if (canSend) onSend(value, webSearchEnabled) }}
              >
                <SendHorizontalIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default ChatInput
