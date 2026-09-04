import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getConversations,
  getMessageDirectory,
  createConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  deleteMessage,
  getCurrentUser,
  ApiError,
  type Conversation,
  type DirectoryUser,
  type Message,
} from "@/lib/api";
import {
  CheckCheck,
  ChevronLeft,
  MessageCircle,
  MessagesSquare,
  Loader2,
  AlertCircle,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

const truncate = (text: string, max = 60) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** Same relative-time convention as Notifications.tsx's formatTime, adapted
 * for an ISO date string instead of a Date object (the API returns strings). */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${days} يوم`;
}

/** Short time-of-day for a message bubble timestamp. "en-US" for Latin
 * digits — matches PartnerDashboard.tsx's own formatDate/formatNumber
 * convention (en-US locale kept even inside this RTL Arabic app), not the
 * main app's separate convertToEnglishDigits utility, which doesn't exist
 * in this repo. */
function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function Messages() {
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ── "محادثة جديدة" inline picker (no modal component exists in this repo) ──
  const [showPicker, setShowPicker] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directorySearch, setDirectorySearch] = useState("");
  const [creatingConversationFor, setCreatingConversationFor] = useState<
    string | null
  >(null);

  // ── Thread view (Batch 2) — an in-page full-view swap, not a route. Batch 1
  // left everything (list + picker) inside this one component with no
  // conversationId route param anywhere, and this app's flat sibling routes +
  // memory history gain nothing from a dedicated per-conversation route over
  // local state — matches the main app's own MessagesView.tsx, which also
  // holds `selectedConversationId` as local state rather than routing per
  // conversation. ──
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = () => {
    setLoading(true);
    getConversations()
      .then((data) => {
        setConversations(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "تعذّر الاتصال بالخادم. حاول مرة أخرى.",
        );
      });
  };

  useEffect(() => {
    loadConversations();
    // Needed to tell "my own" bubbles apart from received ones in the
    // thread view. A silent failure here just leaves currentUserId null —
    // every bubble then renders as "received", a harmless degrade — except
    // a 401, which still redirects like every other call in this app.
    getCurrentUser()
      .then((u) => setCurrentUserId(String(u.id)))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
        }
      });
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPicker = () => {
    setShowPicker(true);
    setDirectorySearch("");
    if (directory.length === 0 && !directoryLoading) {
      setDirectoryLoading(true);
      getMessageDirectory()
        .then((data) => {
          setDirectory(data);
          setDirectoryError(null);
          setDirectoryLoading(false);
        })
        .catch((err) => {
          setDirectoryLoading(false);
          if (err instanceof ApiError && err.status === 401) {
            navigate({ to: "/login" });
            return;
          }
          setDirectoryError(
            err instanceof ApiError
              ? err.message
              : "تعذّر تحميل قائمة المستخدمين.",
          );
        });
    }
  };

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim();
    if (!q) return directory;
    return directory.filter((u) => u.name.includes(q));
  }, [directory, directorySearch]);

  // ── Thread open/close ──────────────────────────────────────────────────
  const openThread = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setThreadMessages([]);
    setThreadError(null);
    setComposerText("");
    setConfirmDeleteId(null);
  };

  const closeThread = () => {
    setSelectedConversation(null);
    setThreadMessages([]);
    setThreadError(null);
    setConfirmDeleteId(null);
  };

  // Fetch the thread, then mark it read and refresh the list in the
  // background so unreadCount/lastMessage are in sync once the user returns
  // to it. PartnerDashboard.tsx's own messagesUnreadCount badge is a fully
  // separate poller in a component this app's flat-route full-page swap
  // unmounts while a thread is open — it refetches fresh on its own next
  // mount (when the user navigates back to /partner-dashboard), so there is
  // no live badge here to push an update into.
  useEffect(() => {
    if (!selectedConversation) return;
    let cancelled = false;
    setThreadLoading(true);
    getMessages(selectedConversation.id)
      .then((data) => {
        if (cancelled) return;
        setThreadMessages(data);
        setThreadError(null);
        setThreadLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setThreadLoading(false);
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
          return;
        }
        setThreadError(
          err instanceof ApiError ? err.message : "تعذّر تحميل الرسائل.",
        );
      });

    markConversationRead(selectedConversation.id)
      .then(() => {
        if (!cancelled) loadConversations();
      })
      .catch(() => {
        // Silent — best-effort read-marking; self-corrects next time the
        // thread opens.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [threadMessages]);

  // Read-receipt polling — while a thread is open, periodically refetches
  // getConversations() and merges ONLY otherParticipantLastReadMessageId for
  // the open conversation into selectedConversation (threadMessages is left
  // untouched). Same ~20-25s cadence as PartnerDashboard.tsx's
  // messagesUnreadCount poller (Batch 1). Cleared whenever the thread closes
  // (selectedConversation becomes null) or the component unmounts — never
  // runs while the user is back on the conversations list.
  useEffect(() => {
    if (!selectedConversation) return;
    const conversationId = selectedConversation.id;
    const interval = setInterval(() => {
      getConversations()
        .then((data) => {
          const match = data.find((c) => c.id === conversationId);
          if (!match) return;
          setSelectedConversation((prev) =>
            prev && prev.id === conversationId
              ? {
                  ...prev,
                  otherParticipantLastReadMessageId:
                    match.otherParticipantLastReadMessageId,
                }
              : prev,
          );
        })
        .catch(() => {
          // Silent — a transient failure just means the indicator doesn't
          // update this tick; the next tick retries.
        });
    }, 22000);
    return () => clearInterval(interval);
  }, [selectedConversation?.id]);

  // The sender's own most-recent message in the open thread — the read
  // receipt indicator (below) only ever renders on this one bubble, never on
  // every own message.
  const lastOwnMessageId = useMemo(() => {
    for (let i = threadMessages.length - 1; i >= 0; i -= 1) {
      const m = threadMessages[i];
      if (currentUserId !== null && String(m.senderId) === currentUserId) {
        return m.id;
      }
    }
    return null;
  }, [threadMessages, currentUserId]);

  // Read receipts are cumulative: the other participant reading a later
  // message implies they've read everything before it, so "seen" is just an
  // id comparison against their last-read cursor.
  const isLastOwnMessageSeen = useMemo(() => {
    const otherLastRead = selectedConversation?.otherParticipantLastReadMessageId;
    if (!lastOwnMessageId || !otherLastRead) return false;
    return Number(otherLastRead) >= Number(lastOwnMessageId);
  }, [selectedConversation?.otherParticipantLastReadMessageId, lastOwnMessageId]);

  const handlePickRecipient = (recipient: DirectoryUser) => {
    if (creatingConversationFor) return;
    setCreatingConversationFor(recipient.id);
    createConversation(recipient.id)
      .then((result) => {
        setCreatingConversationFor(null);
        setShowPicker(false);
        // createConversation() only resolves { id, created } (confirmed
        // against messageService.js#findOrCreateDirectConversation), not a
        // full Conversation row — synthesized here from the picked
        // directory entry we already have on hand so the thread can open
        // immediately; loadConversations() below corrects
        // lastMessage/unreadCount once the real row is fetched.
        openThread({
          id: result.id,
          otherParticipant: {
            id: recipient.id,
            name: recipient.name,
            avatar: recipient.avatar,
            role: recipient.role,
          },
          lastMessage: null,
          lastMessageAt: null,
          unreadCount: 0,
          otherParticipantLastReadMessageId: null,
        });
        loadConversations();
      })
      .catch((err) => {
        setCreatingConversationFor(null);
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
          return;
        }
        setDirectoryError(
          err instanceof ApiError ? err.message : "تعذّر بدء المحادثة.",
        );
      });
  };

  // ── Composer ─────────────────────────────────────────────────────────
  const handleSendMessage = () => {
    if (!selectedConversation) return;
    const body = composerText.trim();
    if (!body || sending) return;
    setSending(true);
    sendMessage(selectedConversation.id, body)
      .then((message) => {
        setThreadMessages((prev) => [...prev, message]);
        setComposerText("");
        setSending(false);
        // Background refresh so the list's preview/unreadCount stay current
        // once the user goes back to it.
        loadConversations();
      })
      .catch((err) => {
        setSending(false);
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
          return;
        }
        setThreadError(
          err instanceof ApiError ? err.message : "تعذّر إرسال الرسالة.",
        );
      });
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Delete (own messages only) ──────────────────────────────────────
  const handleDeleteMessage = (messageId: string) => {
    if (!selectedConversation || deletingMessageId) return;
    setDeletingMessageId(messageId);
    deleteMessage(selectedConversation.id, messageId)
      .then(() => {
        setThreadMessages((prev) => prev.filter((m) => m.id !== messageId));
        setDeletingMessageId(null);
        setConfirmDeleteId(null);
      })
      .catch((err) => {
        setDeletingMessageId(null);
        if (err instanceof ApiError && err.status === 401) {
          navigate({ to: "/login" });
          return;
        }
        setThreadError(
          err instanceof ApiError ? err.message : "تعذّر حذف الرسالة.",
        );
      });
  };

  // ── Thread view ──────────────────────────────────────────────────────
  if (selectedConversation) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#F8FAFC] pb-24">
        <header className="bg-white border-b border-[#e0e2e6] sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <button
              onClick={closeThread}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#181d26] transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-[#e0e2e6] bg-[#F8FAFC] flex items-center justify-center">
              {selectedConversation.otherParticipant?.avatar ? (
                <img
                  src={selectedConversation.otherParticipant.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserRound className="w-4 h-4 text-[#6B7280]" />
              )}
            </div>
            <h1 className="text-base font-bold text-[#181d26] truncate flex-1 min-w-0">
              {selectedConversation.otherParticipant?.name || "مستخدم"}
            </h1>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-4">
          {threadLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1b61c9" }} />
            </div>
          ) : threadError ? (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600 font-medium">{threadError}</p>
            </div>
          ) : threadMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageCircle className="w-12 h-12 mb-3" style={{ color: "#1b61c9" }} />
              <h3 className="text-sm font-bold text-[#181d26] mb-1">ابدأ المحادثة</h3>
              <p className="text-sm text-[#6B7280]">أرسل أول رسالة لبدء هذه المحادثة.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {threadMessages.map((m) => {
                const isMine =
                  currentUserId !== null && String(m.senderId) === currentUserId;
                const isConfirmingDelete = confirmDeleteId === m.id;
                const isLastOwnMessage = isMine && m.id === lastOwnMessageId;
                return (
                  <div key={m.id}>
                    <div
                      className={`flex items-end gap-1.5 ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {isMine &&
                        (isConfirmingDelete ? (
                          <div className="shrink-0 mb-1 flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              disabled={deletingMessageId === m.id}
                              className="text-rose-600 hover:text-rose-700 transition disabled:opacity-50"
                            >
                              {deletingMessageId === m.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "نعم"
                              )}
                            </button>
                            <span className="text-[#6B7280]">/</span>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[#6B7280] hover:text-[#181d26] transition"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          // Always subtly visible, not hover-only — this app
                          // is mobile/touch-shaped and hover-reveal has no
                          // precedent here.
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            title="حذف الرسالة"
                            className="shrink-0 mb-1 p-1 rounded text-[#9CA3AF] hover:text-rose-500 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                          isMine
                            ? "text-white"
                            : "bg-white border border-[#e0e2e6] text-[#181d26]"
                        }`}
                        style={isMine ? { backgroundColor: "#1b61c9" } : undefined}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <span
                          className={`mt-1 block text-[10px] ${
                            isMine ? "text-white/70" : "text-[#6B7280]"
                          }`}
                        >
                          {formatMessageTime(m.createdAt)}
                        </span>
                      </div>
                    </div>
                    {isLastOwnMessage && (
                      <div className="flex items-center justify-end gap-1 px-1 mt-0.5">
                        <CheckCheck
                          className="w-3.5 h-3.5"
                          style={{ color: isLastOwnMessageSeen ? "#1b61c9" : "#9CA3AF" }}
                        />
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: isLastOwnMessageSeen ? "#1b61c9" : "#9CA3AF" }}
                        >
                          {isLastOwnMessageSeen ? "شوهدت" : "تم الإرسال"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Composer — fixed to the bottom, same pattern already used by
            PartnerDashboard.tsx's pull-to-refresh indicator (fixed inset-x-0). */}
        <div className="fixed bottom-0 inset-x-0 border-t border-[#e0e2e6] bg-white px-4 py-3 z-10">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="اكتب رسالة..."
              rows={2}
              className="flex-1 resize-none rounded-lg border border-[#e0e2e6] bg-[#F8FAFC] px-3 py-2 text-sm text-[#181d26] outline-none transition placeholder:text-[#6B7280] focus:border-[#1b61c9] focus:ring-2"
            />
            <button
              onClick={handleSendMessage}
              disabled={!composerText.trim() || sending}
              className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#1b61c9" }}
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Conversations list view ──────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-[#e0e2e6] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/partner-dashboard" })}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#181d26] transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MessageCircle className="w-5 h-5" style={{ color: "#1b61c9" }} />
            <h1 className="text-lg font-bold text-[#181d26]">الرسائل</h1>
          </div>
          <button
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: "#1b61c9" }}
          >
            <Plus className="w-4 h-4" />
            محادثة جديدة
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {/* ── Inline "new conversation" picker ── */}
        {showPicker && (
          <div className="bg-white rounded-2xl border border-[#e0e2e6] p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[#181d26]">
                اختر مستخدماً لبدء محادثة
              </h2>
              <button
                onClick={() => setShowPicker(false)}
                className="text-[#6B7280] hover:text-[#181d26] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="ابحث بالاسم..."
                className="w-full rounded-lg border border-[#e0e2e6] bg-[#F8FAFC] pr-10 pl-3 py-2.5 text-sm text-[#181d26] placeholder:text-[#6B7280] outline-none transition focus:border-[#1b61c9] focus:ring-2"
                style={{ boxShadow: "none" }}
              />
            </div>

            {directoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1b61c9" }} />
              </div>
            ) : directoryError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-center">
                <p className="text-sm text-red-600 font-medium">{directoryError}</p>
              </div>
            ) : filteredDirectory.length === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-6">
                {directorySearch.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد مستخدمون متاحون"}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {filteredDirectory.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handlePickRecipient(u)}
                    disabled={creatingConversationFor !== null}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-right transition hover:bg-[#e8f0fc] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-[#e0e2e6] bg-[#F8FAFC] flex items-center justify-center">
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserRound className="w-4 h-4 text-[#6B7280]" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-[#181d26] flex-1 truncate">
                      {u.name}
                    </span>
                    {creatingConversationFor === u.id && (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#1b61c9" }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Conversations list ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1b61c9" }} />
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e0e2e6] p-8 text-center">
            <MessagesSquare className="w-12 h-12 mx-auto mb-3" style={{ color: "#1b61c9" }} />
            <h3 className="text-sm font-bold text-[#181d26] mb-1">لا توجد محادثات بعد</h3>
            <p className="text-sm text-[#6B7280]">
              ابدأ محادثة جديدة مع أحد الزملاء لتظهر هنا.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openThread(c)}
                className={`w-full text-right bg-white rounded-2xl border p-4 flex items-center gap-3 transition hover:shadow-md ${
                  c.unreadCount > 0 ? "border-[#c5d8f0]" : "border-[#e0e2e6]"
                } ${c.unreadCount > 0 ? "bg-[#e8f0fc]" : ""}`}
              >
                <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 border border-[#e0e2e6] bg-[#F8FAFC] flex items-center justify-center">
                  {c.otherParticipant?.avatar ? (
                    <img
                      src={c.otherParticipant.avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserRound className="w-5 h-5 text-[#6B7280]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold text-[#181d26] truncate">
                      {c.otherParticipant?.name || "مستخدم"}
                    </h2>
                    <span className="text-[11px] text-[#6B7280] shrink-0 whitespace-nowrap">
                      {formatRelativeTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-sm text-[#6B7280] truncate mt-0.5">
                    {c.lastMessage ? truncate(c.lastMessage.body) : "لا توجد رسائل بعد"}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <div
                    className="shrink-0 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: "#1b61c9" }}
                  >
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
