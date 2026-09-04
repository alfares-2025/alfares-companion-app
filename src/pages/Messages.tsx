import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getConversations,
  getMessageDirectory,
  createConversation,
  ApiError,
  type Conversation,
  type DirectoryUser,
} from "@/lib/api";
import {
  ChevronLeft,
  MessageCircle,
  MessagesSquare,
  Loader2,
  AlertCircle,
  Plus,
  Search,
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

export default function Messages() {
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── "محادثة جديدة" inline picker (no modal component exists in this repo) ──
  const [showPicker, setShowPicker] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directorySearch, setDirectorySearch] = useState("");
  const [creatingConversationFor, setCreatingConversationFor] = useState<
    string | null
  >(null);

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

  const handlePickRecipient = (recipientId: string) => {
    if (creatingConversationFor) return;
    setCreatingConversationFor(recipientId);
    createConversation(recipientId)
      .then(() => {
        setCreatingConversationFor(null);
        setShowPicker(false);
        // Batch 1 only builds the conversations list — no thread destination
        // exists yet (Batch 2), so just refresh the list to reflect the
        // (possibly new) conversation.
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

  const handleOpenConversation = (conversationId: string) => {
    // Opening the thread (reading / replying) is Batch 2 — deliberately a
    // no-op placeholder here, matching how the main app staged this feature.
    console.log("open conversation (Batch 2):", conversationId);
  };

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
                    onClick={() => handlePickRecipient(u.id)}
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
                onClick={() => handleOpenConversation(c.id)}
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
