"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Phone, PhoneOff, Users, Clock, Plus,
  ScreenShare, Maximize2, X, Loader2, PhoneIncoming,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/ui/components/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { Badge } from "@/ui/components/badge";
import { cn } from "@/ui/utils";
import { getPusherClient } from "@/platform/integrations/pusher-client";
import { PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { useSession } from "next-auth/react";

interface Participant {
  id: string;
  joinedAt: string;
  leftAt?: string | null;
  user: { id: string; name?: string | null; initials?: string | null; image?: string | null };
}

interface CallRecord {
  id: string;
  roomName: string;
  roomUrl: string;
  title?: string | null;
  type: string;
  status: string;
  startedBy: string;
  createdAt: string;
  endedAt?: string | null;
  starter: { id: string; name?: string | null; initials?: string | null; image?: string | null };
  project?: { id: string; title: string; code: string } | null;
  participants: Participant[];
}

export default function CallsPage() {
  const { data: session } = useSession();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [activeCall, setActiveCall] = useState<(CallRecord & { token?: string }) | null>(null);
  const [showNewCall, setShowNewCall] = useState(false);
  const [callTitle, setCallTitle] = useState("");
  const [callType, setCallType] = useState<"video" | "audio">("video");
  const [creating, setCreating] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchCalls = useCallback(async (incomingId?: string) => {
    const res = await fetch("/api/calls");
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as CallRecord[];
    setCalls(data);

    if (incomingId) {
      // Pusher carries only an id because presence-workspace is intentionally
      // broad. The authorised list decides whether this caller may see the
      // call and receive its incoming-call prompt.
      const incoming = data.find((call) => call.id === incomingId);
      if (incoming && incoming.startedBy !== session?.user?.id) {
        setIncomingCall(incoming);
        setTimeout(() => setIncomingCall(null), 30000);
      }
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    let pusher: ReturnType<typeof getPusherClient>;
    try {
      pusher = getPusherClient();
    } catch (error) {
      console.error("[calls] real-time unavailable: Pusher is not configured", error);
      return;
    }
    const ch = pusher.subscribe("presence-workspace");

    ch.bind(PUSHER_EVENTS.CALL_STARTED, ({ id }: { id: string }) => {
      void fetchCalls(id);
    });

    ch.bind(PUSHER_EVENTS.CALL_ENDED, ({ id }: { id: string }) => {
      setCalls((prev) => prev.map((c) => c.id === id ? { ...c, status: "ended" } : c));
      if (activeCall?.id === id) setActiveCall(null);
    });

    return () => pusher.unsubscribe("presence-workspace");
  }, [activeCall?.id, fetchCalls]);

  const startCall = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: callTitle || undefined, type: callType }),
      });
      const call = await res.json();
      await joinCall(call);
    } finally {
      setCreating(false);
      setShowNewCall(false);
      setCallTitle("");
    }
  };

  const joinCall = async (call: CallRecord) => {
    const res = await fetch(`/api/calls/${call.id}`);
    const data = await res.json();
    setActiveCall(data);
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (!activeCall) return;
    await fetch(`/api/calls/${activeCall.id}`, { method: "DELETE" });
    setActiveCall(null);
  };

  const activeCalls = calls.filter((c) => c.status === "active");
  const pastCalls = calls.filter((c) => c.status === "ended");

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">Calls</h1>
          <p className="text-sm text-muted-foreground">Video & voice calls for the team</p>
        </div>
        <Button onClick={() => setShowNewCall(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Call
        </Button>
      </div>

      {/* Main content */}
      {activeCall ? (
        /* ─── Active Call View ─── */
        <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
          {/* Daily.co iframe */}
          <iframe
            ref={iframeRef}
            src={`${activeCall.roomUrl}?t=${activeCall.token}`}
            allow="camera;microphone;fullscreen;display-capture;picture-in-picture"
            className="flex-1 w-full border-0"
            style={{ minHeight: 0 }}
          />

          {/* Overlay controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-md rounded-2xl px-6 py-3">
            <span className="text-white text-sm font-medium mr-2">
              {activeCall.title ?? "DBS Call"}
            </span>
            <button
              onClick={endCall}
              className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
              title="Leave call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <button
              onClick={() => iframeRef.current?.requestFullscreen()}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Calls */}
          {activeCalls.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Active Now
              </h2>
              <div className="grid gap-3">
                {activeCalls.map((call) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                      {call.type === "video" ? (
                        <Video className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Phone className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{call.title ?? "Team Call"}</span>
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                          Live
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(call.createdAt), { addSuffix: false })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {call.participants.length} participants
                        </span>
                      </div>
                      {/* Participant avatars */}
                      <div className="flex items-center -space-x-2 mt-2">
                        {call.participants.slice(0, 5).map((p) => (
                          <Avatar key={p.id} className="w-6 h-6 border-2 border-background">
                            <AvatarImage src={p.user.image ?? undefined} />
                            <AvatarFallback className="text-[9px] font-bold">
                              {p.user.initials ?? p.user.name?.slice(0, 2).toUpperCase() ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {call.participants.length > 5 && (
                          <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-bold">
                            +{call.participants.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => joinCall(call)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                    >
                      <PhoneIncoming className="w-4 h-4" />
                      Join
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeCalls.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-6 bg-muted rounded-3xl mb-4">
                <Video className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-2">No active calls</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                Start a video or voice call with your team. Includes screen sharing and recording.
              </p>
              <Button onClick={() => setShowNewCall(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Start a Call
              </Button>
            </div>
          )}

          {/* Call History */}
          {pastCalls.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Recent Calls
              </h2>
              <div className="border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {pastCalls.slice(0, 10).map((call) => (
                  <div key={call.id} className="flex items-center gap-4 px-4 py-3">
                    <div className={cn("p-2 rounded-lg", call.type === "video" ? "bg-blue-50 dark:bg-blue-950/20" : "bg-purple-50 dark:bg-purple-950/20")}>
                      {call.type === "video" ? (
                        <Video className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Phone className="w-4 h-4 text-purple-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{call.title ?? "Team Call"}</p>
                      <p className="text-xs text-muted-foreground">
                        Started by {call.starter.name} · {call.participants.length} joined
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(call.createdAt), "MMM d, HH:mm")}
                      </p>
                      {call.endedAt && (
                        <p className="text-xs text-muted-foreground">
                          {Math.round((new Date(call.endedAt).getTime() - new Date(call.createdAt).getTime()) / 60000)} min
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── New Call Modal ─── */}
      <AnimatePresence>
        {showNewCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowNewCall(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-background border border-border rounded-2xl p-6 w-96 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-lg mb-5">Start a Call</h3>

              {/* Call type toggle */}
              <div className="flex gap-2 mb-4">
                {(["video", "audio"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCallType(t)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all font-medium text-sm",
                      callType === t
                        ? "bg-foreground text-background border-foreground"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {t === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    {t === "video" ? "Video Call" : "Voice Call"}
                  </button>
                ))}
              </div>

              <input
                value={callTitle}
                onChange={(e) => setCallTitle(e.target.value)}
                placeholder="Call title (optional)"
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-transparent outline-none mb-4"
                onKeyDown={(e) => e.key === "Enter" && startCall()}
              />

              <div className="bg-muted/50 rounded-xl p-3 mb-5 text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5"><ScreenShare className="w-3.5 h-3.5" /> Screen sharing included</p>
                <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Up to 20 participants</p>
                <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Up to 3 hours</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewCall(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-2" onClick={startCall} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  {creating ? "Starting..." : "Start Call"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Incoming Call Toast ─── */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="fixed bottom-6 right-6 bg-background border border-emerald-500/30 rounded-2xl p-4 shadow-2xl w-80 z-50"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl shrink-0">
                <PhoneIncoming className="w-5 h-5 text-emerald-500 animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Incoming Call</p>
                <p className="text-xs text-muted-foreground">
                  {incomingCall.starter.name} started a {incomingCall.type} call
                </p>
                <p className="text-xs font-medium mt-0.5">{incomingCall.title ?? "Team Call"}</p>
              </div>
              <button onClick={() => setIncomingCall(null)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setIncomingCall(null)}
              >
                Decline
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs gap-1"
                onClick={() => joinCall(incomingCall)}
              >
                <Phone className="w-3 h-3" />
                Join
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
