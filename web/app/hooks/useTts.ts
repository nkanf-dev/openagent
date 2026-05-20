import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "sonner"
import i18next from "i18next"
import { getLanguage } from "~/i18n"
import type { Message } from "~/backend/MessageBackend"
import type { Store } from "~/backend/StoreBackend"
import * as TtsBackend from "~/backend/TtsBackend"

export function useTts() {
  const [isReading, setIsReading] = useState(false)
  const [isLoadingTTS, setIsLoadingTTS] = useState(false)
  const [readingMessage, setReadingMessage] = useState<string | undefined>()
  const [autoRead, setAutoRead] = useState(() => {
    try { return localStorage.getItem("autoRead") === "true" } catch { return false }
  })

  const synthRef = useRef<SpeechSynthesis | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<(ArrayBuffer | "END")[]>([])
  const isProcessingQueueRef = useRef(false)
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const isReadingRef = useRef(false)

  // Keep isReadingRef in sync so queue callbacks can read the latest value
  useEffect(() => {
    isReadingRef.current = isReading
  }, [isReading])

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis
    }
    return () => cleanup()
  }, [])

  function cancelReading() {
    if (synthRef.current) synthRef.current.cancel()

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop() } catch {}
      currentAudioSourceRef.current = null
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }

    audioQueueRef.current = []
    isProcessingQueueRef.current = false
    setIsLoadingTTS(false)
  }

  function cleanup() {
    cancelReading()
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsLoadingTTS(false)
  }

  function processAudioQueue() {
    if (audioQueueRef.current.length === 0 || !isReadingRef.current) {
      isProcessingQueueRef.current = false
      return
    }

    isProcessingQueueRef.current = true
    const item = audioQueueRef.current.shift()!

    if (item === "END") {
      setIsReading(false)
      setReadingMessage(undefined)
      isProcessingQueueRef.current = false
      return
    }

    audioContextRef.current!.decodeAudioData(
      item,
      (buffer) => {
        const source = audioContextRef.current!.createBufferSource()
        source.buffer = buffer
        source.connect(audioContextRef.current!.destination)
        source.onended = () => processAudioQueue()
        source.start(0)
        currentAudioSourceRef.current = source
      },
      () => processAudioQueue(),
    )
  }

  function useStreamingTTS(message: Message, storeId: string, messageId: string) {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    audioQueueRef.current = []
    isProcessingQueueRef.current = false

    const es = TtsBackend.generateTextToSpeechAudioStream(storeId, messageId)
    eventSourceRef.current = es

    es.addEventListener("chunk", (e: MessageEvent) => {
      try {
        const eventData = JSON.parse(e.data)
        if (eventData.type === "audio") {
          const binaryString = atob(eventData.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          audioQueueRef.current.push(bytes.buffer)
          if (!isProcessingQueueRef.current) processAudioQueue()
        }
      } catch {
        toast.error(i18next.t("general:Failed to call TTS API, will use default browser TTS instead"))
        useBrowserTTS(message)
      }
    })

    es.addEventListener("end", () => {
      audioQueueRef.current.push("END")
      if (!isProcessingQueueRef.current) processAudioQueue()
      es.close()
      eventSourceRef.current = null
    })

    es.addEventListener("error", (e: Event) => {
      try {
        const errorData = JSON.parse((e as MessageEvent).data)
        toast.error(`${i18next.t("general:Failed to call TTS API, will use default browser TTS instead")}: ${errorData.error}`)
      } catch {
        toast.error(i18next.t("general:Failed to call TTS API, will use default browser TTS instead"))
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsReading(false)
      setReadingMessage(undefined)
      useBrowserTTS(message)
    })
  }

  function useNonStreamingTTS(message: Message, storeId: string, messageId: string) {
    TtsBackend.generateTextToSpeechAudio(storeId, "", messageId, "")
      .then((blob) => {
        setIsLoadingTTS(false)
        const audioUrl = URL.createObjectURL(blob)
        const player = new Audio(audioUrl)
        audioPlayerRef.current = player
        player.onended = () => {
          URL.revokeObjectURL(audioUrl)
          audioPlayerRef.current = null
          setIsReading(false)
          setReadingMessage(undefined)
        }
        player.play()
      })
      .catch((error) => {
        setIsLoadingTTS(false)
        toast.error(`${i18next.t("general:Failed to call TTS API, will use default browser TTS instead")}: ${error.message}`)
        useBrowserTTS(message)
      })
  }

  function useBrowserTTS(message: Message) {
    const synth = synthRef.current
    if (!synth) return
    synth.cancel()
    const utterThis = new SpeechSynthesisUtterance(message.text || "")
    utterThis.lang = getLanguage()
    utterThis.addEventListener("end", () => {
      synth.cancel()
      setIsReading(false)
      setReadingMessage(undefined)
    })
    synth.speak(utterThis)
    setReadingMessage(message.name)
    setIsReading(true)
  }

  function setAutoReadEnabled(enabled: boolean) {
    setAutoRead(enabled)
    try { localStorage.setItem("autoRead", String(enabled)) } catch {}
  }

  const handleToggleRead = useCallback((message: Message, store: Store | undefined) => {
    const isCurrentBeingRead = readingMessage === message.name

    if (isCurrentBeingRead) {
      if (isReading) {
        // Pause
        if (audioContextRef.current) {
          audioContextRef.current.suspend()
        } else if (audioPlayerRef.current) {
          audioPlayerRef.current.pause()
        } else {
          synthRef.current?.pause()
        }
        setIsReading(false)
      } else {
        // Resume
        if (audioContextRef.current) {
          audioContextRef.current.resume()
        } else if (audioPlayerRef.current) {
          audioPlayerRef.current.play()
        } else {
          synthRef.current?.resume()
        }
        setIsReading(true)
      }
      return
    }

    // Start reading a new message
    cancelReading()

    const useCloudTTS =
      store?.textToSpeechProvider &&
      store.textToSpeechProvider !== "" &&
      store.textToSpeechProvider !== "Browser Built-In"

    if (useCloudTTS) {
      setReadingMessage(message.name)
      setIsReading(true)

      const storeId = `${store!.owner}/${store!.name}`
      const messageId = `${message.owner}/${message.name}`

      if (store!.enableTtsStreaming) {
        useStreamingTTS(message, storeId, messageId)
      } else {
        setIsLoadingTTS(true)
        useNonStreamingTTS(message, storeId, messageId)
      }
    } else {
      useBrowserTTS(message)
    }
  }, [isReading, readingMessage])

  const autoReadMessage = useCallback((message: Message, store: Store | undefined) => {
    if (!autoRead || isReading || readingMessage) return
    if (message.author === "AI" && message.text) {
      handleToggleRead(message, store)
    }
  }, [autoRead, isReading, readingMessage, handleToggleRead])

  return {
    isReading,
    isLoadingTTS,
    readingMessage,
    handleToggleRead,
    cancelTts: cancelReading,
    autoRead,
    setAutoRead: setAutoReadEnabled,
    autoReadMessage,
  }
}
