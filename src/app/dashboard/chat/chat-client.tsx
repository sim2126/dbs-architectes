"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash, Plus, Send, Smile, Paperclip, Search, Settings,
  MoreHorizontal, Reply, Edit2, Trash2, MessageSquare,
  Users, X, Video, Phone,
  AtSign, Loader2, Lock, UserPlus, BookUser,
} from "lucide-react";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPusherClient } from "@/lib/pusher-client";
import { PUSHER_EVENTS } from "@/lib/pusher";
import { useT } from "@/lib/translations";

// ─── Types ───────────────────────────────────────────────────
interface User {
  id: string;
  name?: string | null;
  initials?: string | null;
  image?: string | null;
  role?: string;
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
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  user: User;
  reactions: Reaction[];
  replies: Message[];
  parentId?: string | null;
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
}: {
  message: Message;
  currentUserId: string;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  isThread?: boolean;
  isGrouped?: boolean;
}) {
  const t = useT();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isDeleted = !!message.deletedAt;
  const isOwn = message.userId === currentUserId;

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
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {renderContent(message.content)}
          </p>
        )}

        {/* Reactions */}
        {Object.keys(groupedReactions).length > 0 && (
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
        {!isThread && message.replies.length > 0 && (
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
            <span className="text-xs text-blue-500 font-semibold group-hover/thread:underline">
              {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
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
}: {
  onSend: (content: string) => void;
  loading: boolean;
  placeholder: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  editMessage?: Message | null;
  onCancelEdit?: () => void;
  users?: { id: string; name?: string | null; initials?: string | null }[];
}) {
  const t = useT();
  const [value, setValue] = useState(editMessage?.content ?? "");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mentionQuery !== null
    ? users.filter((u) => u.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (editMessage) setValue(editMessage.content);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setValue("");
    textareaRef.current?.focus();
  }, [editMessage, replyTo]);

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
      handleSend();
    }
  };

  const handleSend = () => {
    if (!value.trim() || loading) return;
    onSend(value.trim());
    setValue("");
    setMentionQuery(null);
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
        {/* Textarea */}
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
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

        {/* Toolbar row */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title={t("chat.attach")}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title={t("chat.emoji")}
            >
              <Smile className="w-4 h-4" />
            </button>
            <button
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
            onClick={handleSend}
            disabled={!value.trim() || loading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              value.trim() && !loading
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
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    initialChannels.find((c) => c.name === "general")?.id ?? initialChannels[0]?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [search, setSearch] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Fetch messages when channel changes
  const fetchMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
      setReplyTo(null);
      setEditMessage(null);
      setThreadMessage(null);
    }
  }, [activeChannelId, fetchMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pusher subscription
  useEffect(() => {
    if (!activeChannelId) return;

    const pusher = getPusherClient();
    const channelSub = pusher.subscribe(`private-channel-${activeChannelId}`);

    channelSub.bind(PUSHER_EVENTS.NEW_MESSAGE, (msg: Message) => {
      setMessages((prev) => {
        if (msg.parentId) {
          return prev.map((m) =>
            m.id === msg.parentId ? { ...m, replies: [...m.replies, msg] } : m
          );
        }
        return [...prev, msg];
      });
      // Update unread count
      setChannels((prev) =>
        prev.map((c) => (c.id === activeChannelId ? { ...c, unread: 0 } : c))
      );
    });

    channelSub.bind(PUSHER_EVENTS.EDIT_MESSAGE, (updated: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });

    channelSub.bind(PUSHER_EVENTS.DELETE_MESSAGE, ({ id }: { id: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: "This message was deleted." } : m))
      );
    });

    channelSub.bind(PUSHER_EVENTS.REACTION_ADD, ({ messageId, reaction }: { messageId: string; reaction: Reaction }) => {
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, reactions: [...m.reactions, reaction] } : m)
      );
    });

    channelSub.bind(PUSHER_EVENTS.REACTION_REMOVE, ({ messageId, reactionId }: { messageId: string; reactionId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, reactions: m.reactions.filter((r) => r.id !== reactionId) }
            : m
        )
      );
    });

    channelSub.bind(PUSHER_EVENTS.TYPING_START, ({ userId, name }: { userId: string; name: string }) => {
      if (userId !== currentUser.id) {
        setTypingUsers((prev) => prev.includes(name) ? prev : [...prev, name]);
      }
    });

    channelSub.bind(PUSHER_EVENTS.TYPING_STOP, ({ userId, name }: { userId: string; name: string }) => {
      if (userId !== currentUser.id) {
        setTypingUsers((prev) => prev.filter((u) => u !== name));
      }
    });

    return () => {
      pusher.unsubscribe(`private-channel-${activeChannelId}`);
    };
  }, [activeChannelId, currentUser.id]);

  // Send message
  const sendMessage = async (content: string) => {
    if (!activeChannelId) return;
    setSendingMessage(true);

    try {
      if (editMessage) {
        await fetch(`/api/chat/messages/${editMessage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setEditMessage(null);
      } else {
        await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: activeChannelId,
            content,
            parentId: replyTo?.id ?? null,
          }),
        });
        setReplyTo(null);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  // React to message
  const reactToMessage = async (msgId: string, emoji: string) => {
    await fetch(`/api/chat/messages/${msgId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  };

  // Delete message
  const deleteMessage = async (msgId: string) => {
    await fetch(`/api/chat/messages/${msgId}`, { method: "DELETE" });
  };

  // Create channel
  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newChannelName, description: newChannelDesc }),
    });
    const ch = await res.json();
    setChannels((prev) => [...prev, ch]);
    setActiveChannelId(ch.id);
    setShowNewChannel(false);
    setNewChannelName("");
    setNewChannelDesc("");
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

  // Filter channels for search
  const filteredChannels = channels.filter((c) =>
    c.type !== "direct" &&
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const dmChannels = channels.filter((c) => c.type === "direct");

  const startDM = async (userId: string) => {
    const otherUser = users.find((u) => u.id === userId);
    if (!otherUser) return;
    const existing = channels.find(
      (c) => c.type === "direct" && c.members.some((m) => m.userId === userId)
    );
    if (existing) {
      setActiveChannelId(existing.id);
      return;
    }
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `dm-${currentUser.id}-${userId}`,
        type: "direct",
        memberIds: [currentUser.id, userId],
      }),
    });
    const ch = await res.json();
    setChannels((prev) => [...prev, ch]);
    setActiveChannelId(ch.id);
  };

  const getChannelDisplayName = (ch: Channel) => {
    if (ch.type !== "direct") return ch.name;
    const other = ch.members.find((m) => m.userId !== currentUser.id);
    return other?.user.name ?? "Direct Message";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ─── Left Sidebar ─── */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col bg-muted/20">
        {/* Workspace Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm">DBS Workspace</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">
                  {users.length} members
                </span>
              </div>
            </div>
            <button className="p-1 hover:bg-muted rounded transition-colors">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels..."
              className="bg-transparent text-xs outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("chat.channels")}
            </span>
            <button
              onClick={() => setShowNewChannel(true)}
              className="p-0.5 hover:bg-muted rounded transition-colors"
              title="New channel"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {filteredChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannelId(ch.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left",
                activeChannelId === ch.id
                  ? "bg-foreground text-background"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {ch.type === "private" ? (
                <Lock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Hash className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate font-medium">{ch.name}</span>
              {(ch.unread ?? 0) > 0 && (
                <Badge className="text-xs px-1.5 py-0 bg-red-500 text-white border-0">
                  {ch.unread}
                </Badge>
              )}
            </button>
          ))}

          {/* Direct Messages */}
          <div className="flex items-center justify-between px-2 py-1.5 mt-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("chat.direct")}
            </span>
          </div>

          {users
            .filter((u) => u.id !== currentUser.id)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => startDM(u.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                  dmChannels.some((c) => c.id === activeChannelId && c.members.some((m) => m.userId === u.id))
                    ? "bg-foreground text-background"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={u.image ?? undefined} />
                    <AvatarFallback className="text-[10px] font-bold bg-foreground/10">
                      {u.initials ?? u.name?.slice(0, 2).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
                </div>
                <span className="flex-1 truncate font-medium">{u.name}</span>
              </button>
            ))}
        </div>
      </div>

      {/* ─── Main Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-muted rounded-lg">
                  {activeChannel.type === "direct" ? (
                    <Users className="w-4 h-4" />
                  ) : (
                    <Hash className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {getChannelDisplayName(activeChannel)}
                  </h3>
                  {activeChannel.description && (
                    <p className="text-xs text-muted-foreground">{activeChannel.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-muted-foreground mr-2">
                  {activeChannel.members.length} members
                </span>
                <button
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Contacts"
                  onClick={() => window.open("/dashboard/contact", "_self")}
                >
                  <BookUser className="w-4 h-4" />
                </button>
                <a
                  href="/dashboard/calls"
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Voice call"
                >
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href="/dashboard/calls"
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Video call"
                >
                  <Video className="w-4 h-4" />
                </a>
                <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="Add member">
                  <UserPlus className="w-4 h-4" />
                </button>
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
                  <div className="p-4 bg-muted rounded-2xl mb-4">
                    <Hash className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-bold mb-1">
                    Welcome to #{getChannelDisplayName(activeChannel)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {activeChannel.description ?? "Start the conversation below."}
                  </p>
                </div>
              ) : (
                <>
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
                            onReply={setThreadMessage}
                            onEdit={setEditMessage}
                            onDelete={deleteMessage}
                            isGrouped={isGrouped}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {typingUsers.length > 0 && (
                    <div className="px-4 py-1 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                            animate={{ y: [0, -4, 0] }}
                            transition={{ delay: i * 0.15, repeat: Infinity, duration: 0.8 }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                      </span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <MessageInput
              onSend={sendMessage}
              loading={sendingMessage}
              placeholder={`Message #${getChannelDisplayName(activeChannel)}`}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              editMessage={editMessage}
              onCancelEdit={() => setEditMessage(null)}
              users={users}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold mb-1">{t("chat.no_channel")}</h3>
              <p className="text-sm text-muted-foreground">{t("chat.no_channel")}</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Thread Sidebar ─── */}
      <AnimatePresence>
        {threadMessage && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="shrink-0 border-l border-border flex flex-col overflow-hidden bg-background"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm">Thread</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  #{activeChannel ? getChannelDisplayName(activeChannel) : ""}
                </p>
              </div>
              <button
                onClick={() => setThreadMessage(null)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {/* Parent message */}
              <MessageItem
                message={threadMessage}
                currentUserId={currentUser.id}
                onReact={reactToMessage}
                onReply={() => {}}
                onEdit={setEditMessage}
                onDelete={deleteMessage}
                isThread
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
                    onEdit={setEditMessage}
                    onDelete={deleteMessage}
                    isThread
                    isGrouped={isGrouped}
                  />
                );
              })}
            </div>
            <MessageInput
              onSend={sendMessage}
              loading={sendingMessage}
              placeholder="Reply in thread..."
              replyTo={threadMessage}
              onCancelReply={() => setThreadMessage(null)}
              users={users}
            />
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
                <Button className="flex-1" onClick={createChannel} disabled={!newChannelName.trim()}>
                  Create Channel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
