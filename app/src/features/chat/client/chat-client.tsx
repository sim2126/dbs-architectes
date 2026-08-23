"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash, Plus, Send, Smile, Paperclip, Search,
  Reply, Edit2, Trash2,
  Users, X, Video, Phone,
  AtSign, Loader2, Lock, UserPlus, Languages,
  FileText, Download, Upload, Eye,
} from "lucide-react";
import { useLanguageStore } from "@/i18n/language-store";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { Button } from "@/ui/components/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { cn } from "@/ui/utils";
import { showToast } from "@/ui/components/toast";
import { getPusherClient } from "@/platform/integrations/pusher-client";
import { GuestBadge } from "@/ui/components/guest-badge";
import { ThreadActions } from "@/features/chat/client/thread-actions";
import { PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { useT } from "@/i18n/translations";
import { EmojiPicker, type EmojiSelection } from "./emoji-picker";
import { FilePreview, typeForFilename } from "@/ui/components/file-preview";

// ─── Attachment helpers ───────────────────────────────────────
type PendingAttachment = { file: File; previewUrl: string | null };

type PresignedUpload = {
  uploadUrl: string;
  finalUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: string;
  backend: "s3" | "local";
  receipt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(name);
}

// ─── Types ───────────────────────────────────────────────────
interface User {
  id: string;
  name?: string | null;
  initials?: string | null;
  image?: string | null;
  role?: string;
  /** Outside the practice. Drives the guest marker — see GuestBadge. */
  isExternal?: boolean;
}

interface Reaction {
  id: string;
  emoji: string;
  user: User;
}

interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  type: string;
  fileUrl?: string | null;
  fileName?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  user: User;
  reactions: Reaction[];
  replies: Message[];
  replyCount?: number;
  parentId?: string | null;
}

function normaliseMessage(value: Message): Message {
  return {
    ...value,
    reactions: Array.isArray(value.reactions) ? value.reactions : [],
    replies: Array.isArray(value.replies)
      ? value.replies.map((reply) => normaliseMessage(reply))
      : [],
  };
}

function mergeMessage(current: Message, incoming: Message): Message {
  return {
    ...current,
    ...incoming,
    reactions: incoming.reactions ?? current.reactions,
    replies: incoming.replies ?? current.replies,
    replyCount: incoming.replyCount ?? current.replyCount,
  };
}

function isOlderMessage(candidate: Message, boundary: Message): boolean {
  const candidateTime = new Date(candidate.createdAt).getTime();
  const boundaryTime = new Date(boundary.createdAt).getTime();
  return candidateTime < boundaryTime ||
    (candidateTime === boundaryTime && candidate.id < boundary.id);
}

interface ChannelMember {
  userId: string;
  role: string;
  user: User;
}

interface Channel {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  createdBy: string;
  /** Set on project channels. Already returned by the API (it uses include,
   *  not select) — this only declares it so callers can reach it. */
  projectId?: string | null;
  members: ChannelMember[];
  unread?: number;
}

interface ChatClientProps {
  initialChannels: Channel[];
  users: User[];
  currentUser: User & { email: string };
}

// ─── Emoji Quick-Picker ───────────────────────────────────────
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🚀"];

// ─── Message Item ─────────────────────────────────────────────
// Slack / Monday.com style: all messages left-aligned, no bubbles.
// Consecutive messages from the same sender are "grouped" — the
// avatar + name are suppressed and a compact timestamp appears on hover.
function MessageItem({
  message,
  currentUserId,
  onReact,
  onReply,
  onEdit,
  onDelete,
  isThread = false,
  isGrouped = false,
  allowInternalActions = true,
}: {
  message: Message;
  currentUserId: string;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  isThread?: boolean;
  isGrouped?: boolean;
  allowInternalActions?: boolean;
}) {
  const t = useT();
  const { translationLang } = useLanguageStore();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const isDeleted = !!message.deletedAt;
  const isOwn = message.userId === currentUserId;

  const handleTranslate = async () => {
    if (translated) { setShowTranslation((v) => !v); return; }
    setTranslating(true);
    setShowTranslation(true);
    setTranslationError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, targetLang: translationLang }),
      });
      const data = await res.json() as { translated?: string; error?: string };
      if (!res.ok || !data.translated) {
        throw new Error(data.error ?? "AI Assistant could not translate this message. Please try again.");
      }
      setTranslated(data.translated);
    } catch (error) {
      setTranslationError(
        error instanceof Error
          ? error.message
          : "AI Assistant could not translate this message. Please try again.",
      );
    } finally {
      setTranslating(false);
    }
  };

  const groupedReactions = message.reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  function renderContent(content: string) {
    const parts = content.split(/(@[\w][\w ]*)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/20 rounded px-0.5 py-px">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 hover:bg-muted/30 transition-colors",
        isGrouped ? "py-0.5" : "pt-3 pb-0.5",
        isThread && "px-3"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
      onFocusCapture={() => setShowActions(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setShowActions(false);
          setShowEmojiPicker(false);
        }
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") setShowActions((visible) => !visible);
      }}
    >
      {/* Avatar column — fixed width so text always starts at the same x */}
      <div className="w-9 shrink-0 pt-0.5">
        {isGrouped ? (
          /* Compact timestamp on hover instead of avatar */
          <span className="block text-center text-[10px] text-muted-foreground leading-none opacity-0 group-hover:opacity-100 transition-opacity mt-1 select-none">
            {format(new Date(message.createdAt), "HH:mm")}
          </span>
        ) : (
          <Avatar className="w-9 h-9">
            <AvatarImage src={message.user.image ?? undefined} />
            <AvatarFallback className="text-[11px] font-bold bg-muted text-foreground">
              {message.user.initials ?? message.user.name?.slice(0, 2).toUpperCase() ?? "??"}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Message body */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-bold text-foreground leading-none">
              {message.user.name ?? "Unknown"}
            </span>
            {/* Guests are marked on every message, not only in the member
                list. Someone scanning a conversation needs to see that an
                outsider is in it at the point they are about to reply. */}
            {message.user.isExternal && <GuestBadge />}
            {isOwn && (
              <span className="text-[10px] text-muted-foreground font-normal">(you)</span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(message.createdAt), "HH:mm")}
            </span>
            {message.editedAt && (
              <span className="text-[11px] text-muted-foreground italic">(edited)</span>
            )}
          </div>
        )}

        {/* Text */}
        {isDeleted ? (
          <p className="text-sm text-muted-foreground italic">{t("chat.message_deleted")}</p>
        ) : (
          <>
            {message.content && (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                {renderContent(message.content)}
              </p>
            )}

            {/* Attachment — image inline thumbnail or file card. The
                Message schema carries one attachment per row; multi-
                attachment would need a separate MessageAttachment table. */}
            {message.fileUrl && message.fileName && (
              <AttachmentRender
                url={message.fileUrl}
                name={message.fileName}
                kind={message.type === "image" || isImageName(message.fileName) ? "image" : "file"}
              />
            )}

            {/* Inline translation block */}
            {allowInternalActions && translating && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Translating…
              </div>
            )}
            {allowInternalActions && showTranslation && (translated || translationError) && (
              <div className="mt-2 rounded-xl border border-blue-200/70 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Languages className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                      AI Assistant · Translation · {translationLang.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTranslation(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Hide
                  </button>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                  {translationError ?? translated}
                </p>
              </div>
            )}
          </>
        )}

        {/* Reactions */}
        {!isDeleted && Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(groupedReactions).map(([emoji, reactors]) => {
              const isMine = reactors.some((r) => r.user.id === currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                    isMine
                      ? "bg-blue-50 border-blue-300 dark:bg-blue-900/30 dark:border-blue-600"
                      : "bg-muted border-border hover:bg-accent"
                  )}
                  title={reactors.map((r) => r.user.name).join(", ")}
                >
                  <span>{emoji}</span>
                  <span className="font-semibold text-foreground">{reactors.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread reply preview — clicking opens thread sidebar */}
        {!isThread && (message.replyCount ?? message.replies.length) > 0 && (
          <button
            onClick={() => onReply(message)}
            className="flex items-center gap-2 mt-1.5 group/thread"
          >
            <div className="flex -space-x-1 shrink-0">
              {message.replies.slice(0, 3).map((r, i) => (
                <Avatar key={i} className="w-5 h-5 border-2 border-background">
                  <AvatarFallback className="text-[8px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    {r.user.initials ?? r.user.name?.slice(0, 2).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-friday-accent font-medium group-hover/thread:underline">
              {message.replyCount ?? message.replies.length}{" "}
              {(message.replyCount ?? message.replies.length) === 1 ? "reply" : "replies"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Last reply {formatDistanceToNow(new Date(message.replies[message.replies.length - 1].createdAt))} ago
            </span>
          </button>
        )}
      </div>

      {/* Hover action toolbar — floats above the row, right-aligned */}
      <AnimatePresence>
        {showActions && !isDeleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.08 }}
            className="absolute -top-4 right-4 flex items-center gap-0.5 bg-background border border-border rounded-xl shadow-md p-0.5 z-10"
          >
            {/* Emoji picker */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                title="Add reaction"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute bottom-full right-0 mb-1 bg-background border border-border rounded-xl shadow-xl p-2 flex gap-1 z-20"
                  >
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(message.id, emoji); setShowEmojiPicker(false); }}
                        className="text-xl hover:scale-125 transition-transform p-0.5"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Translation is an internal AI surface, so guests never see
                an affordance that the server will correctly refuse. */}
            {allowInternalActions && (
              <button
                onClick={handleTranslate}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  showTranslation && translated
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                title={showTranslation && translated ? "Hide translation" : `Translate to ${translationLang.toUpperCase()}`}
              >
                <Languages className="w-3.5 h-3.5" />
              </button>
            )}

            {!isThread && (
              <button
                onClick={() => onReply(message)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                title={t("chat.reply_thread")}
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            )}

            {isOwn && (
              <>
                <button
                  onClick={() => onEdit(message)}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title={t("chat.edit")}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(message.id)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                  title={t("chat.delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────
function DateSeparator({ date }: { date: string }) {
  const t = useT();
  const d = new Date(date);
  const label = isToday(d) ? t("common.today") : isYesterday(d) ? t("common.yesterday") : format(d, "MMMM d, yyyy");
  return (
    <div className="flex items-center gap-3 px-4 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-medium text-muted-foreground px-2">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Attachment renderer (image inline or file card) ───────────
/**
 * A message attachment, opened in place rather than in a new tab.
 *
 * Previewable here means PDF or image: those render from the URL alone.
 * Spreadsheets and Word documents are binary OOXML the browser cannot
 * display, and their preview is built from extracted text — which chat has
 * none of, because chat has no ingestion pipeline. Offering a dialog for
 * those would open an empty frame, so they stay downloads.
 *
 * The Message row records no content type, only a filename, so the type is
 * inferred from the extension. An unrecognised extension falls back to a
 * download, which is the safe direction.
 */
function AttachmentRender({
  url,
  name,
  kind,
}: {
  url: string;
  name: string;
  kind: "image" | "file";
}) {
  const [preview, setPreview] = useState(false);
  const contentType = typeForFilename(name);
  const previewable =
    contentType !== null &&
    (contentType === "application/pdf" || contentType.startsWith("image/"));

  const dialog = previewable ? (
    <FilePreview
      attachment={preview ? { filename: name, contentType: contentType!, url } : null}
      onClose={() => setPreview(false)}
    />
  ) : null;

  if (kind === "image") {
    const thumbnail = (
      /* Using a plain <img> rather than next/image because file uploads land
         on arbitrary URLs (S3 / local) we don't want to pre-register in
         next.config. The thumbnail is bounded by max-w-sm so it never
         dominates the message. */
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={url}
        alt={name}
        className="block w-full max-h-[320px] object-contain bg-background"
      />
    );
    const frame =
      "block mt-2 max-w-sm rounded-lg overflow-hidden border border-border bg-muted/30 hover:border-foreground/30 transition-colors";
    return (
      <>
        {previewable ? (
          <button type="button" onClick={() => setPreview(true)} title={name} className={frame}>
            {thumbnail}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" title={name} className={frame}>
            {thumbnail}
          </a>
        )}
        {dialog}
      </>
    );
  }

  const card =
    "mt-2 inline-flex items-center gap-2.5 max-w-md px-3 py-2 rounded-lg border border-border bg-muted/30 hover:border-foreground/30 hover:bg-muted/60 transition-colors";
  return (
    <>
      {previewable ? (
        <button type="button" onClick={() => setPreview(true)} className={card}>
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[12.5px] text-foreground font-medium truncate">{name}</span>
          <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
        </button>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" download={name} className={card}>
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[12.5px] text-foreground font-medium truncate">{name}</span>
          <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
        </a>
      )}
      {dialog}
    </>
  );
}

// ─── Pending-attachment chip (shown above the composer) ─────────
function PendingChip({
  pending,
  uploading,
  onRemove,
}: {
  pending: PendingAttachment;
  uploading: boolean;
  onRemove: () => void;
}) {
  const file = pending.file;
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 max-w-sm">
      {pending.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pending.previewUrl}
          alt={file.name}
          className="w-8 h-8 object-cover rounded shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0 leading-tight">
        <p className="text-[12px] text-foreground truncate font-medium">{file.name}</p>
        <p className="text-[10.5px] text-muted-foreground">
          {uploading ? "Uploading…" : formatBytes(file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={uploading}
        aria-label="Remove attachment"
        className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Message Input ────────────────────────────────────────────
function MessageInput({
  onSend,
  loading,
  placeholder,
  replyTo,
  onCancelReply,
  editMessage,
  onCancelEdit,
  users = [],
  externalFile,
  onExternalFileConsumed,
}: {
  onSend: (payload: {
    content: string;
    attachment?: PendingAttachment;
    parentId?: string | null;
    editMessageId?: string;
  }) => Promise<boolean>;
  loading: boolean;
  placeholder: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  editMessage?: Message | null;
  onCancelEdit?: () => void;
  users?: { id: string; name?: string | null; initials?: string | null }[];
  /** Drag-and-drop hand-off: parent pushes a file in, we acknowledge. */
  externalFile?: File | null;
  onExternalFileConsumed?: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(editMessage?.content ?? "");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  // Pick up a file the parent drag-drop handler pushed in.
  useEffect(() => {
    if (!externalFile || editMessage) return;
    const timer = window.setTimeout(() => {
      setPending({
        file: externalFile,
        previewUrl: externalFile.type.startsWith("image/")
          ? URL.createObjectURL(externalFile)
          : null,
      });
      onExternalFileConsumed?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editMessage, externalFile, onExternalFileConsumed]);

  // Release object URLs for image previews when the attachment changes
  // or the composer unmounts. Without this every drag-drop leaks a blob.
  useEffect(() => {
    const url = pending?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending]);

  // Close emoji picker on Escape (the picker itself fires onClickOutside).
  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emojiOpen]);

  const mentionMatches = mentionQuery !== null
    ? users.filter((u) => u.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);

    // Detect @mention
    const cursor = e.target.selectionStart ?? 0;
    const textBefore = v.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const textBefore = value.slice(0, cursor);
    const textAfter = value.slice(cursor);
    const replaced = textBefore.replace(/@(\w*)$/, `@${name} `);
    setValue(replaced + textAfter);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = replaced.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex]?.name ?? ""); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSend = async () => {
    const submittedValue = value;
    const text = submittedValue.trim();
    if ((!text && !pending) || loading) return;
    const sent = await onSend({
      content: text,
      attachment: pending ?? undefined,
      parentId: replyTo?.id ?? null,
      editMessageId: editMessage?.id,
    });
    if (!sent) return;
    // Uploads can take long enough for the user to continue typing. Only
    // clear the exact draft that was submitted; preserve newer text.
    setValue((current) => (current === submittedValue ? "" : current));
    setPending(null);
    setMentionQuery(null);
    setEmojiOpen(false);
    if (editMessage) onCancelEdit?.();
  };

  // ─── Attachment handlers ────────────────────────────────────
  const handlePickFile = () => fileInputRef.current?.click();

  const adoptFile = (file: File | null | undefined) => {
    if (editMessage) return;
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("File is larger than 10 MB.", "danger");
      return;
    }
    setPending({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
  };

  const removeAttachment = () => {
    setPending(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Emoji insertion ────────────────────────────────────────
  const handleEmojiSelect = (e: EmojiSelection) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    setValue(before + e.native + after);
    // Restore the cursor after the inserted glyph so the user can keep
    // typing without re-clicking the textarea. Wrapped in setTimeout
    // so React commits the value update first.
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = before.length + e.native.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="px-4 pb-4 pt-1 relative">
      {/* @mention dropdown */}
      <AnimatePresence>
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-4 right-4 mb-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden z-30"
          >
            <div className="px-3 py-2 border-b border-border bg-muted/40">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Mention someone</span>
            </div>
            {mentionMatches.slice(0, 6).map((user, i) => (
              <button
                key={user.id}
                onClick={() => insertMention(user.name ?? "")}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                  i === mentionIndex ? "bg-accent" : "hover:bg-muted"
                )}
              >
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-muted text-foreground">
                    {user.initials ?? user.name?.slice(0, 2).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm leading-none">{user.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">@{(user.name ?? "").toLowerCase().replace(/\s+/g, ".")}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply / Edit banner */}
      <AnimatePresence>
        {(replyTo || editMessage) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-border border-b-0 rounded-t-xl px-3 py-2"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {editMessage ? (
                <><Edit2 className="w-3 h-3 text-blue-500" /> <span className="text-blue-600 font-medium">Editing message</span></>
              ) : (
                <><Reply className="w-3 h-3 text-blue-500" /> Replying to{" "}
                  <span className="font-semibold text-foreground">{replyTo?.user.name}</span></>
              )}
            </div>
            <button
              onClick={editMessage ? onCancelEdit : onCancelReply}
              className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input box */}
      <div className={cn(
        "bg-background border border-border rounded-xl shadow-sm overflow-hidden",
        (replyTo || editMessage) && "rounded-t-none border-t-0"
      )}>
        {/* Pending attachment chip — appears ABOVE the textarea so the
            user can see what they're about to send without scrolling. */}
        {pending && (
          <div className="px-3 pt-2.5">
            <PendingChip
              pending={pending}
              uploading={loading}
              onRemove={removeAttachment}
            />
          </div>
        )}

        {/* Textarea */}
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={Boolean(editMessage) && loading}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground leading-relaxed py-1 max-h-36 overflow-y-auto"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 144)}px`;
            }}
          />
        </div>

        {/* Hidden native file input — triggered by the Paperclip button. */}
        <input
          ref={fileInputRef}
          type="file"
          disabled={Boolean(editMessage)}
          className="hidden"
          onChange={(e) => {
            adoptFile(e.target.files?.[0]);
            // Clear so re-picking the same file fires a fresh change event.
            e.target.value = "";
          }}
        />

        {/* Toolbar row */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handlePickFile}
              disabled={Boolean(pending) || Boolean(editMessage) || loading}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={pending ? "One attachment per message — remove the current one to swap" : t("chat.attach")}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Emoji picker — anchored above the trigger via absolute
                positioning. emoji-mart's own onClickOutside closes it. */}
            <div ref={emojiWrapRef} className="relative">
              <button
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  emojiOpen
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                title={t("chat.emoji")}
                aria-expanded={emojiOpen}
              >
                <Smile className="w-4 h-4" />
              </button>
              {emojiOpen && (
                <div className="absolute bottom-full left-0 mb-2 z-40">
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClickOutside={() => setEmojiOpen(false)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title={t("chat.mention")}
              onClick={() => {
                setValue((v) => v + "@");
                textareaRef.current?.focus();
                setMentionQuery("");
              }}
            >
              <AtSign className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              <kbd className="font-mono bg-muted px-1 rounded text-[10px]">↵</kbd> send ·{" "}
              <kbd className="font-mono bg-muted px-1 rounded text-[10px]">⇧↵</kbd> newline
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={(!value.trim() && !pending) || loading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              (value.trim() || pending) && !loading
                ? "bg-foreground text-background hover:opacity-80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {!loading && t("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function ChatClient({ initialChannels, users, currentUser }: ChatClientProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const channelParam = searchParams.get("channel");
  const projectParam = searchParams.get("project");
  const threadParam = searchParams.get("thread");
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    initialChannels.find(
      (channel) =>
        channel.id === channelParam ||
        (projectParam !== null && channel.projectId === projectParam),
    )?.id ??
      initialChannels.find((channel) => channel.name === "general")?.id ??
      initialChannels[0]?.id ??
      null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const sendingMessageRef = useRef(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [threadEditMessage, setThreadEditMessage] = useState<Message | null>(null);
  const activeChannelIdRef = useRef(activeChannelId);
  const threadMessageRef = useRef<Message | null>(threadMessage);
  const messageRequestRef = useRef<AbortController | null>(null);
  const messageRequestIdRef = useRef(0);
  const messageCountRef = useRef(0);
  const skipNextAutoScrollRef = useRef(false);
  activeChannelIdRef.current = activeChannelId;
  threadMessageRef.current = threadMessage;
  messageCountRef.current = messages.length;

  // Threads are addressable. Without a URL a thread cannot be linked, shared
  // or reached with the back button — a manager saying "see the thread" has
  // nothing to send. The id lives in a query param so the channel route is
  // unchanged and an unknown id degrades to no thread rather than an error.
  const openThread = useCallback(
    (msg: Message | null) => {
      setThreadMessage(msg);
      setThreadEditMessage(null);
      const params = new URLSearchParams(searchParams.toString());
      if (msg) {
        params.set("thread", msg.id);
        params.set("channel", msg.channelId);
      }
      else params.delete("thread");
      // replace, not push: opening a thread should not fill the back stack
      // with every panel toggle. scroll:false keeps the message list put.
      router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  const selectChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId);
      setThreadMessage(null);
      setThreadEditMessage(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("channel", channelId);
      params.delete("project");
      params.delete("thread");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [search, setSearch] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [startingDmUserId, setStartingDmUserId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  // Drag-drop handoff to MessageInput. The thread region accepts file
  // drops anywhere; on drop we set this state and MessageInput's
  // externalFile effect picks it up + clears it.
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Fetch messages when channel changes. Requests are both aborted and
  // generation-checked: a slow response for channel A must never overwrite
  // channel B after a quick switch.
  const fetchMessages = useCallback(async (
    channelId: string,
    options: { cursor?: string; prepend?: boolean; silent?: boolean } = {},
  ) => {
    const requestId = ++messageRequestIdRef.current;
    messageRequestRef.current?.abort();
    const controller = new AbortController();
    messageRequestRef.current = controller;
    if (options.prepend) setLoadingOlder(true);
    else if (!options.silent) setLoadingMessages(true);
    try {
      const params = new URLSearchParams({ channelId });
      if (options.cursor) params.set("cursor", options.cursor);
      if (options.silent) {
        params.set("limit", String(Math.min(100, Math.max(50, messageCountRef.current))));
      }
      const res = await fetch(`/api/chat/messages?${params}`, {
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: Message[];
        hasMore?: boolean;
        nextCursor?: string | null;
        error?: string;
      };
      if (!res.ok) {
        if ((res.status === 403 || res.status === 404) && activeChannelIdRef.current === channelId) {
          setChannels((current) => current.filter((item) => item.id !== channelId));
          setActiveChannelId(null);
        }
        throw new Error(data.error ?? "Could not load this conversation.");
      }
      if (
        controller.signal.aborted ||
        requestId !== messageRequestIdRef.current ||
        activeChannelIdRef.current !== channelId
      ) {
        return;
      }
      const incoming = (data.messages ?? []).map(normaliseMessage);
      if (options.prepend) {
        skipNextAutoScrollRef.current = true;
        setMessages((current) => {
          const newerIds = new Set(current.map((message) => message.id));
          return [...incoming.filter((message) => !newerIds.has(message.id)), ...current];
        });
      } else if (options.silent && incoming.length > 0) {
        // The API caps a page at 100. Preserve already-loaded history older
        // than that authoritative window instead of making it disappear on
        // every real-time invalidation.
        setMessages((current) => {
          const incomingIds = new Set(incoming.map((message) => message.id));
          const oldestIncoming = incoming[0];
          const retainedOlder = current.filter(
            (message) =>
              !incomingIds.has(message.id) &&
              isOlderMessage(message, oldestIncoming),
          );
          return [...retainedOlder, ...incoming];
        });
      } else {
        setMessages(incoming);
      }
      setHasOlder(data.hasMore === true);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (requestId === messageRequestIdRef.current && activeChannelIdRef.current === channelId) {
        if (!options.prepend && !options.silent) setMessages([]);
        showToast(
          error instanceof Error ? error.message : "Could not load this conversation.",
          "danger",
        );
      }
    } finally {
      if (requestId === messageRequestIdRef.current) {
        setLoadingMessages(false);
        setLoadingOlder(false);
      }
    }
  }, []);

  const fetchOpenThread = useCallback(async (threadId: string) => {
    try {
      const response = await fetch(
        `/api/chat/messages?threadId=${encodeURIComponent(threadId)}`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        thread?: Message;
        error?: string;
      };
      if (!response.ok || !body.thread) {
        if (
          (response.status === 403 || response.status === 404) &&
          threadMessageRef.current?.id === threadId
        ) {
          setThreadEditMessage(null);
          openThread(null);
        }
        throw new Error(body.error ?? "This thread is no longer available.");
      }
      if (threadMessageRef.current?.id === threadId) {
        setThreadMessage(normaliseMessage(body.thread));
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "This thread is no longer available.",
        "warning",
      );
    }
  }, [openThread]);

  useEffect(() => {
    if (activeChannelId) {
      setHasOlder(false);
      setNextCursor(null);
      void fetchMessages(activeChannelId);
      setReplyTo(null);
      setEditMessage(null);
      setThreadMessage(null);
      setThreadEditMessage(null);
    } else {
      setMessages([]);
      setEditMessage(null);
      setThreadMessage(null);
      setThreadEditMessage(null);
    }
  }, [activeChannelId, fetchMessages]);

  useEffect(() => () => messageRequestRef.current?.abort(), []);

  // Restore a thread from the URL once its channel's messages have loaded.
  // This is what makes a pasted thread link work; without it the param is
  // written but never read. An id that matches nothing in this channel is
  // ignored rather than erroring — a stale link degrades to the channel
  // view, which is the useful failure.
  useEffect(() => {
    if (!threadParam) return;
    if (
      threadMessage?.id === threadParam &&
      threadMessage.replies.length >=
        (threadMessage.replyCount ?? threadMessage.replies.length)
    ) {
      return;
    }
    const found = messages.find((m) => m.id === threadParam);
    if (
      found &&
      found.replies.length >= (found.replyCount ?? found.replies.length)
    ) {
      setThreadMessage(found);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/chat/messages?threadId=${encodeURIComponent(threadParam)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          thread?: Message;
          error?: string;
        };
        if (!response.ok || !body.thread) {
          if (response.status === 403 || response.status === 404) {
            setThreadEditMessage(null);
            openThread(null);
          }
          throw new Error(body.error ?? "This thread is no longer available.");
        }
        setThreadMessage(normaliseMessage(body.thread));
        if (body.thread.channelId !== activeChannelId) {
          setActiveChannelId(body.thread.channelId);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showToast(
          error instanceof Error ? error.message : "This thread is no longer available.",
          "warning",
        );
      });

    return () => controller.abort();
  }, [
    activeChannelId,
    threadParam,
    messages,
    threadMessage?.id,
    threadMessage?.replies.length,
    threadMessage?.replyCount,
    openThread,
  ]);

  // Auto-scroll
  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pusher subscription
  useEffect(() => {
    if (!activeChannelId) return;

    const pusher = getPusherClient();
    const channelSub = pusher.subscribe(`private-channel-${activeChannelId}`);

    // Real-time events are invalidations, not data transport. The API checks
    // current membership and action grants on every refresh, closing the gap
    // where a socket remains subscribed briefly after access is revoked.
    const refreshFromAuthoritativeApi = () => {
      void fetchMessages(activeChannelId, { silent: true });
      const openThreadId = threadMessageRef.current?.id;
      if (openThreadId) void fetchOpenThread(openThreadId);
      setChannels((prev) =>
        prev.map((c) => (c.id === activeChannelId ? { ...c, unread: 0 } : c))
      );
    };
    channelSub.bind(PUSHER_EVENTS.NEW_MESSAGE, refreshFromAuthoritativeApi);
    channelSub.bind(PUSHER_EVENTS.EDIT_MESSAGE, refreshFromAuthoritativeApi);
    channelSub.bind(PUSHER_EVENTS.DELETE_MESSAGE, refreshFromAuthoritativeApi);
    channelSub.bind(PUSHER_EVENTS.REACTION_ADD, refreshFromAuthoritativeApi);
    channelSub.bind(PUSHER_EVENTS.REACTION_REMOVE, refreshFromAuthoritativeApi);

    return () => {
      pusher.unsubscribe(`private-channel-${activeChannelId}`);
    };
  }, [activeChannelId, fetchMessages, fetchOpenThread]);

  const applyAuthoritativeMessage = useCallback((wireMessage: Message) => {
    const incoming = normaliseMessage(wireMessage);
    setMessages((current) => {
      if (incoming.parentId) {
        return current.map((message) => {
          if (message.id !== incoming.parentId) return message;
          const existing = message.replies.find((reply) => reply.id === incoming.id);
          const replies = existing
            ? message.replies.map((reply) =>
                reply.id === incoming.id ? mergeMessage(reply, incoming) : reply,
              )
            : [...message.replies, incoming];
          return {
            ...message,
            replies,
            replyCount: Math.max(message.replyCount ?? message.replies.length, replies.length),
          };
        });
      }
      const existing = current.find((message) => message.id === incoming.id);
      return existing
        ? current.map((message) =>
            message.id === incoming.id ? mergeMessage(message, incoming) : message,
          )
        : [...current, incoming];
    });
    setThreadMessage((current) => {
      if (!current) return current;
      if (current.id === incoming.id) return mergeMessage(current, incoming);
      if (incoming.parentId !== current.id) return current;
      const existing = current.replies.find((reply) => reply.id === incoming.id);
      const replies = existing
        ? current.replies.map((reply) =>
            reply.id === incoming.id ? mergeMessage(reply, incoming) : reply,
          )
        : [...current.replies, incoming];
      return {
        ...current,
        replies,
        replyCount: Math.max(current.replyCount ?? current.replies.length, replies.length),
      };
    });
  }, []);

  // Send message — uploads first if an attachment is present, then
  // creates the message. Failure modes are explicit: upload errors are
  // surfaced via toast and the message is NOT created (so the user
  // doesn't end up with an empty / broken message they didn't intend).
  const sendMessage = async (payload: {
    content: string;
    attachment?: PendingAttachment;
    parentId?: string | null;
    editMessageId?: string;
  }): Promise<boolean> => {
    if (!activeChannelId || sendingMessageRef.current) return false;
    const targetChannelId = activeChannelId;
    sendingMessageRef.current = true;
    setSendingMessage(true);

    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileReceipt: string | null = null;

      if (payload.attachment) {
        const file = payload.attachment.file;
        // 1) Presign
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            contentLength: file.size,
            purpose: "chat",
            targetId: targetChannelId,
          }),
        });
        if (!presignRes.ok) {
          const body = (await presignRes.json().catch(() => ({}))) as { error?: string };
          showToast(body.error ?? "Couldn't prepare upload", "danger");
          return false;
        }
        const presigned = (await presignRes.json()) as PresignedUpload;

        // 2) Direct upload to the backend the presigner picked.
        const uploadRes = await fetch(presigned.uploadUrl, {
          method: presigned.method,
          headers: presigned.headers,
          body: file,
        });
        if (!uploadRes.ok) {
          showToast("Upload failed. Try again.", "danger");
          return false;
        }
        fileUrl = presigned.finalUrl;
        fileName = file.name;
        fileReceipt = presigned.receipt;
      }

      // 3) Create the message (text + optional fileUrl/fileName)
      if (payload.editMessageId) {
        const editRes = await fetch(`/api/chat/messages/${payload.editMessageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: payload.content }),
        });
        const body = (await editRes.json().catch(() => ({}))) as Message & { error?: string };
        if (!editRes.ok || !body.id) {
          showToast(body.error ?? "Could not save the message.", "danger");
          return false;
        }
        if (activeChannelIdRef.current === targetChannelId) {
          applyAuthoritativeMessage(body);
        }
      } else {
        const messageRes = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: targetChannelId,
            content: payload.content,
            parentId: payload.parentId ?? null,
            fileUrl,
            fileName,
            fileReceipt,
          }),
        });
        const body = (await messageRes.json().catch(() => ({}))) as Message & { error?: string };
        if (!messageRes.ok || !body.id) {
          showToast(body.error ?? "Could not send the message.", "danger");
          return false;
        }
        if (activeChannelIdRef.current === targetChannelId) {
          applyAuthoritativeMessage(body);
        }
        setReplyTo(null);
      }
      return true;
    } catch {
      showToast("Could not send the message. Please try again.", "danger");
      return false;
    } finally {
      sendingMessageRef.current = false;
      setSendingMessage(false);
    }
  };

  // React to message
  const reactToMessage = async (msgId: string, emoji: string) => {
    try {
      const response = await fetch(`/api/chat/messages/${msgId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Could not update the reaction.", "danger");
        return;
      }
      const channelId = activeChannelIdRef.current;
      if (channelId) void fetchMessages(channelId, { silent: true });
      const threadId = threadMessageRef.current?.id;
      if (threadId) void fetchOpenThread(threadId);
    } catch {
      showToast("Could not update the reaction.", "danger");
    }
  };

  // Delete message
  const deleteMessage = async (msgId: string) => {
    try {
      const response = await fetch(`/api/chat/messages/${msgId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Could not delete the message.", "danger");
        return;
      }
      const channelId = activeChannelIdRef.current;
      if (channelId) void fetchMessages(channelId, { silent: true });
      const threadId = threadMessageRef.current?.id;
      if (threadId) void fetchOpenThread(threadId);
    } catch {
      showToast("Could not delete the message.", "danger");
    }
  };

  // Create channel
  const createChannel = async () => {
    if (!newChannelName.trim() || creatingChannel) return;
    setCreatingChannel(true);
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName, description: newChannelDesc }),
      });
      const ch = (await res.json().catch(() => ({}))) as Channel & { error?: string };
      if (!res.ok || !ch.id) {
        showToast(ch.error ?? "Could not create the channel.", "danger");
        return;
      }
      setChannels((prev) => [...prev, ch]);
      selectChannel(ch.id);
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelDesc("");
    } catch {
      showToast("Could not create the channel.", "danger");
    } finally {
      setCreatingChannel(false);
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; messages: Message[] }[]>((acc, msg) => {
    const dateKey = format(new Date(msg.createdAt), "yyyy-MM-dd");
    const last = acc[acc.length - 1];
    if (last?.date === dateKey) {
      last.messages.push(msg);
    } else {
      acc.push({ date: dateKey, messages: [msg] });
    }
    return acc;
  }, []);

  // Unified search across both channels and DMs.
  const searchQuery = search.trim().toLowerCase();
  const filteredChannels = channels.filter(
    (c) => c.type !== "direct" && c.name.toLowerCase().includes(searchQuery),
  );
  const dmChannels = channels.filter((c) => c.type === "direct");
  const filteredUsers = users
    .filter((u) => u.id !== currentUser.id)
    .filter(
      (u) =>
        !currentUser.isExternal ||
        dmChannels.some((channel) =>
          channel.members.some((member) => member.userId === u.id),
        ),
    )
    .filter((u) =>
      searchQuery.length === 0
        ? true
        : (u.name ?? "").toLowerCase().includes(searchQuery),
    );

  const startDM = async (userId: string) => {
    const otherUser = users.find((u) => u.id === userId);
    if (!otherUser) return;
    const existing = channels.find(
      (c) => c.type === "direct" && c.members.some((m) => m.userId === userId)
    );
    if (existing) {
      selectChannel(existing.id);
      return;
    }
    if (startingDmUserId) return;
    setStartingDmUserId(userId);
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `dm-${currentUser.id}-${userId}`,
          type: "direct",
          memberIds: [currentUser.id, userId],
        }),
      });
      const ch = (await res.json().catch(() => ({}))) as Channel & { error?: string };
      if (!res.ok || !ch.id) {
        showToast(ch.error ?? "Could not open the direct conversation.", "danger");
        return;
      }
      setChannels((prev) =>
        prev.some((channel) => channel.id === ch.id) ? prev : [...prev, ch],
      );
      selectChannel(ch.id);
    } catch {
      showToast("Could not open the direct conversation.", "danger");
    } finally {
      setStartingDmUserId(null);
    }
  };

  const canManageActiveChannel = Boolean(
    activeChannel &&
      activeChannel.type !== "direct" &&
      !currentUser.isExternal &&
      (currentUser.role === "admin" ||
        currentUser.role === "super_admin" ||
        activeChannel.createdBy === currentUser.id ||
        activeChannel.members.some(
          (member) =>
            member.userId === currentUser.id &&
            (member.role === "owner" || member.role === "admin"),
        )),
  );
  const addableUsers = activeChannel
    ? users.filter(
        (user) =>
          user.id !== currentUser.id &&
          !activeChannel.members.some((member) => member.userId === user.id) &&
          (!activeChannel.projectId || user.isExternal),
      )
    : [];

  const addMember = async () => {
    if (!activeChannel || !addMemberId || addingMember) return;
    setAddingMember(true);
    try {
      const response = await fetch(`/api/chat/channels/${activeChannel.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addMemberId }),
      });
      const member = (await response.json().catch(() => ({}))) as ChannelMember & {
        error?: string;
      };
      if (!response.ok || !member.userId) {
        showToast(member.error ?? "Could not add this person.", "danger");
        return;
      }
      setChannels((current) =>
        current.map((channel) =>
          channel.id === activeChannel.id &&
          !channel.members.some((existing) => existing.userId === member.userId)
            ? { ...channel, members: [...channel.members, member] }
            : channel,
        ),
      );
      setShowAddMember(false);
      setAddMemberId("");
      showToast(`${member.user.name ?? "Member"} added to the conversation.`, "success");
    } catch {
      showToast("Could not add this person.", "danger");
    } finally {
      setAddingMember(false);
    }
  };

  const getChannelDisplayName = (ch: Channel) => {
    if (ch.type !== "direct") return ch.name;
    const other = ch.members.find((m) => m.userId !== currentUser.id);
    return other?.user.name ?? "Direct Message";
  };

  return (
    // h-full + min-h-0 fits exactly inside the dashboard layout's <main>
    // (which is flex-1). Using h-screen here forces the chat taller than
    // its parent and pushes the composer below the viewport — that was
    // the original "you have to scroll to type" bug.
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      {/* ─── Directory column ─── */}
      <div className="w-[42vw] min-w-[160px] max-w-[260px] sm:min-w-[220px] shrink-0 border-r border-border flex flex-col min-h-0 bg-muted/20">
        {/* Workspace header — name + active-member chip. No gear; the
            global topbar owns workspace settings. */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="font-display italic text-base leading-tight tracking-tight text-foreground">
            DBS Workspace
          </h2>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-muted-foreground">
              {users.length} members
            </span>
          </div>
        </div>

        {/* Unified search — matches both channels and DMs */}
        <div className="px-3 pt-2.5 pb-1.5 shrink-0">
          <div className="flex items-center gap-2 bg-muted/60 border border-border/60 rounded-md px-2.5 h-8">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels &amp; people…"
              className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Directory body — scrolls within the column; sections grouped */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-0">
          {/* CHANNELS */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
              {t("chat.channels")}
              <span className="ml-1.5 font-mono text-muted-foreground/70">
                {filteredChannels.length}
              </span>
            </span>
            {!currentUser.isExternal && (
              <button
                onClick={() => setShowNewChannel(true)}
                className="p-0.5 -mr-0.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                title="New channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredChannels.length === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] text-muted-foreground italic font-display">
              No channels match.
            </p>
          ) : (
            <ul className="space-y-px">
              {filteredChannels.map((ch) => {
                const isActive = activeChannelId === ch.id;
                const unread = ch.unread ?? 0;
                return (
                  <li key={ch.id}>
                    <button
                      onClick={() => selectChannel(ch.id)}
                      className={cn(
                        "w-full flex items-center gap-2 h-[28px] px-2 rounded-md text-[12.5px] transition-colors text-left",
                        isActive
                          ? "bg-foreground/[0.06] text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      )}
                    >
                      {ch.type === "private" ? (
                        <Lock className="w-3 h-3 shrink-0 opacity-70" />
                      ) : (
                        <Hash className="w-3 h-3 shrink-0 opacity-70" />
                      )}
                      <span className={cn(
                        "flex-1 truncate",
                        unread > 0 && !isActive && "text-foreground font-medium",
                      )}>
                        {ch.name}
                      </span>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-friday-accent text-white text-[10px] font-semibold tabular-nums">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* DIRECT MESSAGES */}
          <div className="flex items-center justify-between px-2 py-1.5 mt-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
              {t("chat.direct")}
              <span className="ml-1.5 font-mono text-muted-foreground/70">
                {filteredUsers.length}
              </span>
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] text-muted-foreground italic font-display">
              No teammates match.
            </p>
          ) : (
            <ul className="space-y-px">
              {filteredUsers.map((u) => {
                const dmChannel = dmChannels.find((c) =>
                  c.members.some((m) => m.userId === u.id),
                );
                const isActive =
                  dmChannel != null && dmChannel.id === activeChannelId;
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => startDM(u.id)}
                      disabled={startingDmUserId !== null}
                      className={cn(
                        "w-full flex items-center gap-2 h-[30px] px-1.5 rounded-md text-[12.5px] transition-colors text-left",
                        isActive
                          ? "bg-foreground/[0.06] text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className="relative shrink-0">
                        <Avatar className="w-[22px] h-[22px]">
                          <AvatarImage src={u.image ?? undefined} />
                          <AvatarFallback className="text-[9px] font-semibold bg-muted text-foreground">
                            {u.initials ?? u.name?.slice(0, 2).toUpperCase() ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-px -right-px w-2 h-2 rounded-full bg-emerald-500 border-2 border-background" />
                      </span>
                      <span className="flex-1 truncate">{u.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Main Chat Area ─── */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDragEnter={(e) => {
          // Only react to file drags, not text/in-app drags.
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) setDroppedFile(file);
        }}
      >
        {/* Drag overlay — covers the thread when a file is being dragged
            over it. Pointer-events-none so the underlying composer keeps
            working; the parent's onDrop captures the file. */}
        {dragOver && (
          <div className="absolute inset-2 z-20 rounded-2xl border-2 border-dashed border-friday-accent bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Upload className="w-6 h-6 text-friday-accent mx-auto mb-2" />
              <p className="font-display italic text-foreground text-lg leading-tight">
                Drop to attach.
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Up to 10 MB. Images, PDFs, plans, docs.
              </p>
            </div>
          </div>
        )}
        {activeChannel ? (
          <>
            {/* Channel header — name + one-line purpose, member-count
                chip and action row on the right. No giant icon block;
                the # / @ glyph sits inline with the name. */}
            <div className="px-5 py-2.5 border-b border-border flex items-center gap-4 shrink-0 min-h-[52px]">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {activeChannel.type === "direct" ? (
                  <AtSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : activeChannel.type === "private" ? (
                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <h3 className="text-[14px] font-semibold text-foreground truncate">
                  {getChannelDisplayName(activeChannel)}
                </h3>
                {/*
                 * Channel-level guest notice.
                 *
                 * More useful than the per-message badge, which only warns
                 * after someone has posted. This warns before you type — the
                 * failure being prevented is an internal remark about fees or
                 * a contractor landing in a conversation the author had
                 * forgotten a client was part of.
                 */}
                {activeChannel.members.some((m) => m.user.isExternal) && (
                  <span
                    title="A guest from outside the practice is in this channel"
                    className="inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border border-friday-error-border bg-friday-error-bg text-friday-error-fg"
                  >
                    Guest present
                  </span>
                )}
                {activeChannel.description && (
                  <>
                    <span className="text-muted-foreground/40 text-xs shrink-0">·</span>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {activeChannel.description}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <span
                  className="inline-flex items-center gap-1 px-2 h-[24px] rounded-full bg-muted/70 text-[11px] text-muted-foreground font-mono tabular-nums mr-1"
                  title={`${activeChannel.members.length} ${activeChannel.members.length === 1 ? "member" : "members"}`}
                >
                  <Users className="w-3 h-3" />
                  {activeChannel.members.length}
                </span>
                {!currentUser.isExternal && (
                  <>
                    <a
                      href="/dashboard/calls"
                      className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                      title="Voice call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href="/dashboard/calls"
                      className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                      title="Video call"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </a>
                  </>
                )}
                {canManageActiveChannel && (
                  <button
                    onClick={() => {
                      setAddMemberId("");
                      setShowAddMember(true);
                    }}
                    className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                    title="Add member"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-2">
              {loadingMessages ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <h3 className="font-display italic text-foreground text-2xl tracking-tight leading-tight">
                    Quiet here.
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
                    {activeChannel.description
                      ? activeChannel.description
                      : activeChannel.type === "direct"
                        ? "Send the first message — they'll see it when they next open Friday."
                        : `Send the first message in #${getChannelDisplayName(activeChannel)} and the team will see it.`}
                  </p>
                </div>
              ) : (
                <>
                  {hasOlder && nextCursor && (
                    <div className="flex justify-center py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingOlder}
                        onClick={() => {
                          if (activeChannelId && nextCursor) {
                            void fetchMessages(activeChannelId, {
                              cursor: nextCursor,
                              prepend: true,
                            });
                          }
                        }}
                      >
                        {loadingOlder ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Load older messages
                      </Button>
                    </div>
                  )}
                  {groupedMessages.map(({ date, messages: dayMsgs }) => (
                    <div key={date}>
                      <DateSeparator date={`${date}T12:00:00`} />
                      {dayMsgs.map((msg, idx) => {
                        const prev = idx > 0 ? dayMsgs[idx - 1] : null;
                        const isGrouped = !!(
                          prev &&
                          prev.userId === msg.userId &&
                          !prev.deletedAt &&
                          new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
                        );
                        return (
                          <MessageItem
                            key={msg.id}
                            message={msg}
                            currentUserId={currentUser.id}
                            onReact={reactToMessage}
                            onReply={openThread}
                            onEdit={(message) => {
                              setThreadEditMessage(null);
                              setEditMessage(message);
                            }}
                            onDelete={deleteMessage}
                            isGrouped={isGrouped}
                            allowInternalActions={!currentUser.isExternal}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <MessageInput
              key={editMessage?.id ?? replyTo?.id ?? "channel-composer"}
              onSend={sendMessage}
              loading={sendingMessage}
              placeholder={`Message #${getChannelDisplayName(activeChannel)}`}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              editMessage={editMessage}
              onCancelEdit={() => setEditMessage(null)}
              users={users}
              externalFile={droppedFile}
              onExternalFileConsumed={() => setDroppedFile(null)}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <h3 className="font-display italic text-foreground text-2xl tracking-tight leading-tight">
                Pick a channel.
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                {t("chat.no_channel")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Thread Sidebar ─── */}
      <AnimatePresence>
        {threadMessage && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "min(360px, 100%)", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 z-30 shrink-0 border-l border-border flex flex-col overflow-hidden bg-background sm:static sm:z-auto"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm">
                  {threadMessage.user?.name
                    ? `${threadMessage.user.name.split(" ")[0]}'s thread`
                    : "Thread"}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  #{activeChannel ? getChannelDisplayName(activeChannel) : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setThreadEditMessage(null);
                  openThread(null);
                }}
                aria-label="Close thread"
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ThreadActions
              key={threadMessage.id}
              threadId={threadMessage.id}
              sourceText={threadMessage.content}
              projectId={activeChannel?.projectId ?? null}
              channelId={threadMessage.channelId}
              canCreateTask={!currentUser.isExternal && !threadMessage.deletedAt}
            />
            <div className="flex-1 overflow-y-auto py-2">
              {/* Parent message */}
              <MessageItem
                message={threadMessage}
                currentUserId={currentUser.id}
                onReact={reactToMessage}
                onReply={() => {}}
                onEdit={(message) => {
                  setEditMessage(null);
                  setThreadEditMessage(message);
                }}
                onDelete={deleteMessage}
                isThread
                allowInternalActions={!currentUser.isExternal}
              />
              <div className="px-4 my-3 flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                  {threadMessage.replies.length === 0
                    ? "No replies yet"
                    : `${threadMessage.replies.length} ${threadMessage.replies.length === 1 ? "reply" : "replies"}`}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {threadMessage.replies.map((reply, idx) => {
                const prev = idx > 0 ? threadMessage.replies[idx - 1] : null;
                const isGrouped = !!(
                  prev &&
                  prev.userId === reply.userId &&
                  new Date(reply.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
                );
                return (
                  <MessageItem
                    key={reply.id}
                    message={reply}
                    currentUserId={currentUser.id}
                    onReact={reactToMessage}
                    onReply={() => {}}
                    onEdit={(message) => {
                      setEditMessage(null);
                      setThreadEditMessage(message);
                    }}
                    onDelete={deleteMessage}
                    isThread
                    isGrouped={isGrouped}
                    allowInternalActions={!currentUser.isExternal}
                  />
                );
              })}
            </div>
            {!threadMessage.deletedAt && (
              <MessageInput
                key={`${threadMessage.id}:${threadEditMessage?.id ?? "reply"}`}
                onSend={sendMessage}
                loading={sendingMessage}
                placeholder="Reply in thread..."
                replyTo={threadMessage}
                onCancelReply={() => {
                  setThreadEditMessage(null);
                  openThread(null);
                }}
                editMessage={threadEditMessage}
                onCancelEdit={() => setThreadEditMessage(null)}
                users={users}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── New Channel Modal ─── */}
      <AnimatePresence>
        {showNewChannel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowNewChannel(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background border border-border rounded-2xl p-6 w-96 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-lg mb-4">Create a channel</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Channel Name
                  </label>
                  <div className="flex items-center gap-2 mt-1 border border-border rounded-lg px-3 py-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <input
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      placeholder="e.g. design-reviews"
                      className="flex-1 bg-transparent outline-none text-sm"
                      onKeyDown={(e) => e.key === "Enter" && createChannel()}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Description (optional)
                  </label>
                  <input
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                    placeholder="What is this channel about?"
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewChannel(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={createChannel} disabled={!newChannelName.trim() || creatingChannel}>
                  {creatingChannel ? "Creatingâ€¦" : "Create Channel"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddMember && activeChannel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowAddMember(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-channel-member-title"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background border border-border rounded-2xl p-6 w-96 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="add-channel-member-title" className="font-bold text-lg mb-4">
                Add a member
              </h3>
              {addableUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Everyone eligible is already in this conversation.
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="channel-member"
                    className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    Person
                  </label>
                  <select
                    id="channel-member"
                    value={addMemberId}
                    onChange={(event) => setAddMemberId(event.target.value)}
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none"
                  >
                    <option value="">Select a person</option>
                    {addableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name ?? "Unnamed user"}{user.isExternal ? " (guest)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddMember(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => void addMember()}
                  disabled={!addMemberId || addingMember}
                >
                  {addingMember ? "Adding…" : "Add member"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
