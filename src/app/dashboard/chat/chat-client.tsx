"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash, Plus, Send, Smile, Paperclip, Search, Settings,
  MoreHorizontal, Reply, Edit2, Trash2, MessageSquare,
  Users, X, ChevronDown, Check, Video, Phone, Bell,
  AtSign, Loader2, Lock, Globe, UserPlus,
} from "lucide-react";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPusherClient } from "@/lib/pusher-client";
import { PUSHER_EVENTS } from "@/lib/pusher";

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
function MessageItem({
  message,
  currentUserId,
  onReact,
  onReply,
  onEdit,
  onDelete,
  isThread = false,
}: {
  message: Message;
  currentUserId: string;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  isThread?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isDeleted = !!message.deletedAt;
  const isOwn = message.userId === currentUserId;

  // Group reactions by emoji
  const groupedReactions = message.reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  const formatTime = (iso: string) => format(new Date(iso), "HH:mm");

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-1 hover:bg-muted/30 rounded-lg transition-colors",
        isThread && "py-0.5"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      <Avatar className="w-9 h-9 mt-0.5 shrink-0">
        <AvatarImage src={message.user.image ?? undefined} />
        <AvatarFallback className="text-xs font-bold bg-foreground text-background">
          {message.user.initials ?? message.user.name?.slice(0, 2).toUpperCase() ?? "??"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-semibold text-sm">{message.user.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
          {message.editedAt && (
            <span className="text-xs text-muted-foreground italic">(edited)</span>
          )}
        </div>

        {isDeleted ? (
          <p className="text-sm text-muted-foreground italic">This message was deleted.</p>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
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
                      ? "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-600"
                      : "bg-muted border-border hover:bg-muted/80"
                  )}
                  title={reactors.map((r) => r.user.name).join(", ")}
                >
                  <span>{emoji}</span>
                  <span className="font-medium">{reactors.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread replies count */}
        {!isThread && message.replies.length > 0 && (
          <button
            onClick={() => onReply(message)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {/* Hover Actions */}
      <AnimatePresence>
        {showActions && !isDeleted && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-4 top-0 -translate-y-1/2 flex items-center gap-1 bg-background border border-border rounded-lg shadow-lg p-1 z-10"
          >
            {/* Emoji picker */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                title="Add reaction"
              >
                <Smile className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-xl p-2 flex gap-1 z-20"
                  >
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(message.id, emoji); setShowEmojiPicker(false); }}
                        className="text-xl hover:scale-125 transition-transform p-1"
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
                className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                title="Reply in thread"
              >
                <Reply className="w-4 h-4" />
              </button>
            )}

            {isOwn && (
              <>
                <button
                  onClick={() => onEdit(message)}
                  className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                  title="Edit message"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(message.id)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors text-muted-foreground hover:text-red-500"
                  title="Delete message"
                >
                  <Trash2 className="w-4 h-4" />
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
  const d = new Date(date);
  const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
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
}: {
  onSend: (content: string) => void;
  loading: boolean;
  placeholder: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  editMessage?: Message | null;
  onCancelEdit?: () => void;
}) {
  const [value, setValue] = useState(editMessage?.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editMessage) setValue(editMessage.content);
    else setValue("");
    textareaRef.current?.focus();
  }, [editMessage, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!value.trim() || loading) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="px-4 pb-4">
      {/* Reply / Edit banner */}
      <AnimatePresence>
        {(replyTo || editMessage) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between bg-muted/50 border border-border rounded-t-xl px-3 py-2 border-b-0"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {editMessage ? (
                <><Edit2 className="w-3.5 h-3.5" /> Editing message</>
              ) : (
                <><Reply className="w-3.5 h-3.5" /> Replying to <span className="font-semibold text-foreground">{replyTo?.user.name}</span></>
              )}
            </div>
            <button onClick={editMessage ? onCancelEdit : onCancelReply} className="hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        "flex items-end gap-2 bg-muted/30 border border-border rounded-xl p-3",
        (replyTo || editMessage) && "rounded-t-none border-t-0"
      )}>
        <div className="flex gap-2 shrink-0">
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Attach file">
            <Paperclip className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Emoji">
            <Smile className="w-4 h-4" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground leading-relaxed max-h-32 overflow-y-auto"
          style={{ height: "auto" }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
          }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || loading}
          className={cn(
            "shrink-0 p-2 rounded-lg transition-all",
            value.trim() && !loading
              ? "bg-foreground text-background hover:opacity-80"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function ChatClient({ initialChannels, users, currentUser }: ChatClientProps) {
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
              Channels
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
              Direct Messages
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
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-2">
                  {activeChannel.members.length} members
                </span>
                <a
                  href="/dashboard/calls"
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Start video call"
                >
                  <Video className="w-4 h-4" />
                </a>
                <a
                  href="/dashboard/calls"
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Start voice call"
                >
                  <Phone className="w-4 h-4" />
                </a>
                <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground">
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
                      {dayMsgs.map((msg) => (
                        <MessageItem
                          key={msg.id}
                          message={msg}
                          currentUserId={currentUser.id}
                          onReact={reactToMessage}
                          onReply={setReplyTo}
                          onEdit={setEditMessage}
                          onDelete={deleteMessage}
                        />
                      ))}
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
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold mb-1">No channel selected</h3>
              <p className="text-sm text-muted-foreground">Choose a channel to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Thread Sidebar ─── */}
      <AnimatePresence>
        {threadMessage && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 border-l border-border flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm">Thread</h3>
              <button onClick={() => setThreadMessage(null)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <MessageItem
                message={threadMessage}
                currentUserId={currentUser.id}
                onReact={reactToMessage}
                onReply={() => {}}
                onEdit={setEditMessage}
                onDelete={deleteMessage}
                isThread
              />
              <div className="px-4 my-3">
                <div className="h-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {threadMessage.replies.length} replies
                </span>
              </div>
              {threadMessage.replies.map((reply) => (
                <MessageItem
                  key={reply.id}
                  message={reply}
                  currentUserId={currentUser.id}
                  onReact={reactToMessage}
                  onReply={() => {}}
                  onEdit={setEditMessage}
                  onDelete={deleteMessage}
                  isThread
                />
              ))}
            </div>
            <MessageInput
              onSend={sendMessage}
              loading={sendingMessage}
              placeholder="Reply in thread..."
              replyTo={threadMessage}
              onCancelReply={() => setThreadMessage(null)}
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
