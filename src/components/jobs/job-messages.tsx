"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { formatRelativeTime } from "@/lib/utils";
import { Send, MessageCircle } from "lucide-react";

interface Message {
  id: string;
  senderId: string;
  senderType: string;
  content: string;
  createdAt: string;
}

interface JobMessagesProps {
  jobId: string;
  currentUserId: string;
}

export function JobMessages({ jobId, currentUserId }: JobMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/messages?limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      // messages are newest-first from API, reverse for display
      setMessages((data.messages as Message[]).reverse());
    } catch {
      // silent fail on poll
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!content.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send");
      }
      const msg = await res.json() as Message;
      setMessages((prev) => [...prev, msg]);
      setContent("");
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading messages…</div>;

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <MessageCircle className="h-8 w-8 opacity-40" />
          <p className="text-sm">No messages yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
          {messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : msg.senderType === "BOT"
                        ? "bg-secondary/20 border border-secondary/30"
                        : "bg-muted"
                  }`}
                >
                  {!isMe && (
                    <p className="text-xs font-medium mb-0.5 opacity-70">
                      {msg.senderType === "BOT" ? "🤖 Bot" : "👤 Owner"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-xs opacity-50 mt-1 text-right">
                    {formatRelativeTime(new Date(msg.createdAt))}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <Textarea
          placeholder="Type a message…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <Button size="sm" onClick={sendMessage} disabled={sending || !content.trim()} className="self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for new line</p>
    </div>
  );
}
