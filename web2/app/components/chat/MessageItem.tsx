import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { AlertTriangleIcon, GlobeIcon, FileTextIcon, InfoIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "~/components/ui/avatar"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import MessageActions, { CopyButton } from "~/components/chat/MessageActions"
import MessageSuggestions from "~/components/chat/MessageSuggestions"
import ToolCallSection from "~/components/chat/ToolCallSection"
import SearchSourcesDrawer from "~/components/chat/SearchSourcesDrawer"
import KnowledgeSourcesDrawer from "~/components/chat/KnowledgeSourcesDrawer"
import { renderText } from "~/lib/ChatMessageRender"
import { getDefaultAiAvatar, getUserAvatar, getRefinedErrorText } from "~/lib/chatUtils"
import { MessageCarrier } from "~/components/chat/MessageCarrier"
import type { Message } from "~/backend/MessageBackend"
import type { Account } from "~/backend/AccountBackend"
import type { Store } from "~/backend/StoreBackend"

type Props = {
  message: Message
  index: number
  isLastMessage: boolean
  account: Account | null | undefined
  avatar: string
  onCopy: (m: Message) => void
  onRegenerate: (index: number) => void
  onLike: (m: Message, type: "like" | "dislike") => void
  onToggleRead: (m: Message) => void
  onEditMessage: (m: Message, silent?: boolean) => void
  disableInput?: boolean
  hideInput?: boolean
  isReading: boolean
  isLoadingTTS: boolean
  readingMessage: string | undefined
  sendMessage: (text: string, fileName?: string) => void
  hideThinking?: boolean
}

export default function MessageItem({
  message,
  index,
  isLastMessage,
  account,
  avatar,
  onCopy,
  onRegenerate,
  onLike,
  onToggleRead,
  disableInput,
  hideInput,
  isReading,
  isLoadingTTS,
  readingMessage,
  sendMessage,
  hideThinking,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [avatarSrc, setAvatarSrc] = useState<string>("")
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [reasonExpanded, setReasonExpanded] = useState(true)
  const [searchDrawerVisible, setSearchDrawerVisible] = useState(false)
  const [knowledgeDrawerVisible, setKnowledgeDrawerVisible] = useState(false)
  const [isHovering, setIsHovering] = useState(false)

  const isUserMessage = message.author !== "AI"

  useEffect(() => {
    setAvatarSrc(isUserMessage ? getUserAvatar(message, account) : avatar)
  }, [message.author, avatar, account, message, isUserMessage])

  const mergedSearchResults = useMemo(() => {
    const merged = [...(message.searchResults || [])]
    if (message.toolCalls) {
      message.toolCalls
        .filter((tc) => tc.name === "web_fetch" && tc.content)
        .forEach((tc) => {
          let url = ""
          let purpose = ""
          try {
            const args = JSON.parse(tc.arguments)
            url = args.url || ""
            purpose = args.purpose || ""
          } catch {}
          if (!url || purpose === "get_list") return
          let title = url
          try {
            const content = JSON.parse(tc.content)
            const lines: string[] = content[0]["text"].split("\n")
            const titleLine = lines.find((l: string) => l.includes("Title:"))
            title = titleLine ? titleLine.replace("Title:", "").trim() : url
          } catch {}
          merged.push({
            url,
            title,
            site_name: (() => { try { return new URL(url).hostname } catch { return "" } })(),
            index: merged.length + 1,
          })
        })
    }
    return merged
  }, [message.searchResults, message.toolCalls])

  const renderThinkingAnimation = () => (
    <div className="flex items-center gap-2 p-2">
      <span className="text-primary font-semibold">{t("chat:Thinking")}</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-primary h-1.5 w-1.5 rounded-full"
            style={{
              animation: "thinkingDot 1.4s infinite ease-in-out both",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes thinkingDot {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  )

  const renderMessageContent = () => {
    if (message.errorText) {
      const isNoModel =
        message.errorText.includes("Please add a model provider first") ||
        message.errorText.includes("请先添加模型提供商")
      return (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangleIcon className="h-4 w-4 !text-amber-600" />
          <AlertDescription className="flex flex-wrap items-center gap-1 text-xs">
            {getRefinedErrorText(message.errorText)}
            {isNoModel ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs font-semibold"
                onClick={() => navigate("/quick-setup")}
              >
                {t("chat:No model provider - action")} →
              </Button>
            ) : !hideInput ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs font-semibold"
                onClick={() => { setIsRegenerating(true); onRegenerate(index) }}
                disabled={isRegenerating}
              >
                {isRegenerating ? t("general:Regenerating...") : t("general:Regenerate")} →
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      )
    }

    if (message.text === "" && message.author === "AI" && !message.reasonText && (!message.toolCalls?.length)) {
      return null
    }

    if (message.isReasoningPhase && message.author === "AI" && !message.toolCalls && !message.text) {
      return null
    }

    if ((message.reasonText || message.toolCalls?.length) && message.author === "AI") {
      return (
        <div>
          {!hideThinking && message.reasonText && (
            <Collapsible open={reasonExpanded} onOpenChange={setReasonExpanded} className="mb-3">
              <CollapsibleTrigger className="text-primary border-primary flex items-center gap-2 border-l-2 pl-2 text-sm font-semibold">
                {t("chat:Reasoning process")}
                <ChevronDownIcon
                  className="h-3.5 w-3.5 transition-transform"
                  style={{ transform: reasonExpanded ? "rotate(180deg)" : "" }}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 pl-3 text-sm text-muted-foreground">
                  {renderText(message.reasonText)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          <ToolCallSection toolCalls={message.toolCalls} />
          <div>{message.html || renderText(message.text)}</div>
        </div>
      )
    }

    if (isLastMessage && message.author === "AI" && message.text) {
      const carrier = new MessageCarrier(false)
      return renderText(carrier.parseAnswerWithCarriers(message.text).finalAnswer)
    }

    return message.html || (message.text ? renderText(message.text) : null)
  }

  const renderReasoningBubble = () => {
    if (!message.isReasoningPhase || message.author !== "AI" || !message.reasonText) return null
    return (
      <div className="mb-2">
        <div className="flex items-start gap-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarSrc} onError={() => setAvatarSrc(getDefaultAiAvatar())} />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <div className="bg-muted rounded-lg rounded-tl-sm p-3 text-sm">
            {hideThinking
              ? renderThinkingAnimation()
              : (
                <Collapsible open={reasonExpanded} onOpenChange={setReasonExpanded}>
                  <CollapsibleTrigger className="text-primary border-primary flex items-center gap-2 border-l-2 pl-2 text-sm font-semibold">
                    {t("chat:Reasoning process")}
                    <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" style={{ transform: reasonExpanded ? "rotate(180deg)" : "" }} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 pl-3 text-sm text-muted-foreground">
                      {renderText(message.reasonText)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
          </div>
        </div>
      </div>
    )
  }

  const renderBubble = () => {
    if (message.isReasoningPhase && message.author === "AI") return null

    if (isUserMessage) {
      return (
        <div
          className="flex items-end justify-end gap-2"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div
            className="transition-opacity duration-200"
            style={{ opacity: isHovering ? 1 : 0 }}
          >
            <CopyButton message={message} onCopy={onCopy} />
          </div>
          <div className="bg-primary text-primary-foreground max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-sm">
            {message.hintText && (
              <div className="mb-2 flex items-start gap-1.5 text-xs opacity-80">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {message.hintText}
              </div>
            )}
            {renderMessageContent()}
          </div>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarSrc} onError={() => setAvatarSrc(getDefaultAiAvatar())} />
            <AvatarFallback>{account?.name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
        </div>
      )
    }

    // AI message
    const isLoading =
      message.text === "" &&
      message.author === "AI" &&
      !message.reasonText &&
      !message.errorText &&
      !message.toolCalls?.length

    return (
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={avatarSrc} onError={() => setAvatarSrc(getDefaultAiAvatar())} />
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="bg-muted inline-block max-w-full rounded-lg rounded-tl-sm px-4 py-3 text-sm">
            {message.hintText && (
              <div className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {message.hintText}
              </div>
            )}
            {isLoading ? (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted-foreground/50"
                    style={{ animation: "thinkingDot 1.2s infinite ease-in-out both", animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            ) : (
              renderMessageContent()
            )}
          </div>

          {/* Footer */}
          {!message.isReasoningPhase && (!disableInput || !isLastMessage) && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <MessageActions
                  message={message}
                  isLastMessage={isLastMessage}
                  index={index}
                  onCopy={onCopy}
                  onRegenerate={onRegenerate}
                  onLike={onLike}
                  onToggleRead={onToggleRead}
                  isReading={isReading}
                  isLoadingTTS={isLoadingTTS}
                  readingMessage={readingMessage}
                  account={account}
                  setIsRegenerating={setIsRegenerating}
                  isRegenerating={isRegenerating}
                  hideInput={hideInput}
                />
                {mergedSearchResults.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary h-6 gap-1 px-2 text-xs"
                    onClick={() => setSearchDrawerVisible(true)}
                  >
                    <GlobeIcon className="h-3 w-3" />
                    {mergedSearchResults.length} {t("chat:Web sources")}
                  </Button>
                )}
                {(message.vectorScores?.length ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary h-6 gap-1 px-2 text-xs"
                    onClick={() => setKnowledgeDrawerVisible(true)}
                  >
                    <FileTextIcon className="h-3 w-3" />
                    {message.vectorScores!.length} {t("chat:Knowledge sources")}
                  </Button>
                )}
              </div>
              {isLastMessage && (
                <MessageSuggestions message={message} sendMessage={sendMessage} />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`mb-4 max-w-[90%] ${isUserMessage ? "ml-auto" : "mr-auto"}`}>
        <div
          className={`mb-1 text-[11px] text-muted-foreground/50 ${isUserMessage ? "text-right" : "text-left"} px-10`}
        >
          {format(new Date(message.createdTime), "HH:mm")}
        </div>
        {renderReasoningBubble()}
        {renderBubble()}
      </div>

      <SearchSourcesDrawer
        visible={searchDrawerVisible}
        onClose={() => setSearchDrawerVisible(false)}
        searchResults={mergedSearchResults}
      />
      <KnowledgeSourcesDrawer
        visible={knowledgeDrawerVisible}
        onClose={() => setKnowledgeDrawerVisible(false)}
        vectorScores={message.vectorScores}
        account={account}
      />
    </>
  )
}
