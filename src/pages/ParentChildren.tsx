import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  getParentChildren,
  getSchoolLogo,
  getFinanceSummary,
  getPaymentNotificationCount,
  getCommitmentSummary,
  markPaymentsSeen,
  parentLogout,
  ApiError,
  type ParentChild,
  type ParentFinanceSummary,
  type ParentCommitmentSummary,
} from "@/lib/api";
import {
  Loader2,
  AlertCircle,
  Users,
  LogOut,
  X,
  Sun,
  Moon,
  Bell,
  Star,
  ChevronLeft,
  Activity,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";

/**
 * Parent Portal — children list (multi-child guardians land here after
 * login; single-child guardians skip straight to the finance detail).
 *
 * Visual language copy-adapted from PartnerDashboard.tsx (time-of-day
 * greeting, school-branding header, semantic tints, rounded section cards) —
 * nothing in that file is exported, so the patterns are replicated here.
 */

/** Time-of-day greeting, same buckets as PartnerDashboard.tsx. */
function computeGreeting(): { text: string; isNight: boolean } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "صباح الخير", isNight: false };
  if (hour >= 12 && hour < 18) return { text: "مساء الخير", isNight: false };
  return { text: "مساء الخير", isNight: true };
}

/** First token of the guardian's name for the "أهلاً، …" heading. */
function firstName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "ولي الأمر";
  return trimmed.split(/\s+/)[0];
}

/** Local copy of PartnerDashboard.tsx's currency formatter (not exported there). */
function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("en-US")} شيكل (₪)`;
}

/**
 * Grammatically-correct Arabic for "for N child(ren)". Arabic number agreement
 * needs four cases, so a bare `لـ${n} أبناء` (wrong for 1, 2, and 11+) will not
 * do:
 *   1        → لابن واحد
 *   2        → لابنين
 *   3‑10     → لـ{n} أبناء   (plural of paucity)
 *   11+      → لـ{n} ابنًا    (accusative singular after 11+)
 */
function formatChildrenCount(n: number): string {
  if (n === 1) return "لابن واحد";
  if (n === 2) return "لابنين";
  if (n >= 3 && n <= 10) return `لـ${n} أبناء`;
  return `لـ${n} ابنًا`;
}

export default function ParentChildren() {
  const navigate = useNavigate();
  // Untyped/loose read — no validateSearch is registered on this route, so
  // this stays a plain optional flash message rather than a new app-wide
  // search-param convention. Set by ParentStudentFinance.tsx when a 403
  // redirects a guardian back here.
  const search = useSearch({ strict: false }) as { error?: string };

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [guardianName, setGuardianName] = useState("");
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [financeSummary, setFinanceSummary] =
    useState<ParentFinanceSummary | null>(null);
  const [commitment, setCommitment] =
    useState<ParentCommitmentSummary | null>(null);
  const [unreadPayments, setUnreadPayments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(
    search?.error ?? null,
  );

  const [greeting, setGreeting] = useState(computeGreeting);
  
  // Shared in-flight guard so pull-to-refresh never fires overlapping fetches.
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setGreeting(computeGreeting()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const fetchChildrenData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      // Skip if a fetch (pull-to-refresh) is already running.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const [data, logo, summary, notif, commit] = await Promise.all([
          getParentChildren(),
          // Best-effort: these are their own (heavier / secondary) endpoints and a
          // failure in any must never blank the page — getParentChildren still
          // carries any real 401 to the catch below.
          getSchoolLogo().catch(() => ({ schoolLogo: null as string | null })),
          getFinanceSummary().catch(() => null as ParentFinanceSummary | null),
          getPaymentNotificationCount().catch(() => ({ unreadCount: 0 })),
          getCommitmentSummary().catch(
            () => null as ParentCommitmentSummary | null,
          ),
        ]);
        setChildren(data.students);
        setGuardianName(data.guardianName);
        setSchoolName(data.schoolName);
        setSchoolLogo(logo.schoolLogo);
        setFinanceSummary(summary);
        setUnreadPayments(notif.unreadCount);
        setCommitment(commit);
        if (!background) setLoading(false);
        // "Opening the list = read": clear the badge server-side for next
        // visit. Fire-and-forget — the count shown this render stays the
        // pre-mark value on purpose.
        void markPaymentsSeen().catch(() => {});
      } catch (err) {
        if (background) {
          // Silent background auto-refresh failure — keep the last
          // successful data on screen and do not disrupt the UI.
          console.error("Parent children auto-refresh failed:", err);
          return;
        }
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
      } finally {
        isFetchingRef.current = false;
      }
    },
    [navigate],
  );

  useEffect(() => {
    fetchChildrenData();
  }, [fetchChildrenData]);

  // Pull-to-refresh
  const {
    pullDistance,
    isRefreshing,
    pullProgress,
    handlePullTouchStart,
    handlePullTouchMove,
    handlePullTouchEnd,
  } = usePullToRefresh({
    onRefresh: () => fetchChildrenData({ background: true }),
    isFetchingRef,
  });

  async function handleLogout() {
    try {
      await parentLogout();
    } catch {
      // Ignore — still navigate to /login below regardless, matching this
      // app's existing "logout always lands you on /login" convention.
    } finally {
      navigate({ to: "/login" });
    }
  }

  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#F8FAFC" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1b61c9" }} />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{ backgroundColor: "#F8FAFC" }}
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      {/* Pull-to-refresh indicator (touch only) */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        pullProgress={pullProgress}
      />
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-2xl mx-auto">
          {/* Row 1: greeting (right) + new-payment bell + logout chip (left) */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "#6B7280" }}
              >
                {greeting.text}
              </span>
              {greeting.isNight ? (
                <Moon className="w-4 h-4" style={{ color: "#6B7280" }} />
              ) : (
                <Sun className="w-4 h-4" style={{ color: "#6B7280" }} />
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Bell → the detailed recent-activity feed (Batch 10). The
                  badge still shows the Batch 8 new-payment count (the most
                  salient event type), fetched on mount before mark-seen
                  clears it; the activity page keeps its own separate
                  "seen" cursor. */}
              <div className="relative">
                <button
                  onClick={() =>
                    navigate({ to: "/parent-dashboard/activity" })
                  }
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                  style={{ backgroundColor: "#e8f0fc" }}
                  aria-label={
                    unreadPayments > 0
                      ? `النشاط المالي — ${unreadPayments} دفعات جديدة`
                      : "النشاط المالي"
                  }
                >
                  <Bell className="w-4 h-4" style={{ color: "#1b61c9" }} />
                </button>
                {unreadPayments > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white border-2 border-white pointer-events-none"
                    style={{ backgroundColor: "#1b61c9" }}
                  >
                    {unreadPayments > 99 ? "99+" : unreadPayments}
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                aria-label="تسجيل خروج"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                style={{ backgroundColor: "#e8f0fc" }}
              >
                <LogOut className="w-4 h-4" style={{ color: "#1b61c9" }} />
              </button>
            </div>
          </div>

          {/* Greeting heading — directly below the top row, aligned to match the
              time-of-day greeting above it (right, in RTL). */}
          <h1
            className="text-[22px] font-medium text-right"
            style={{ color: "#181d26" }}
          >
            أهلاً، {firstName(guardianName)}
          </h1>

          {/* Aggregate commitment stars across ALL the guardian's children —
              same round(committed / total * 5) formula and gold/muted Star
              treatment as StudentsView.tsx's per-student rating. Hidden
              entirely when no child has an installment plan yet (total 0),
              so an absence of data never reads as poor commitment. */}
          {commitment && commitment.totalInstallments > 0 && (
            <div className="mt-1.5">
              <div
                className="flex items-center gap-0.5"
                role="img"
                aria-label={`الالتزام ${commitment.starRating} من 5`}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    size={14}
                    strokeWidth={1.5}
                    className={
                      i < commitment.starRating
                        ? "text-[#F59E0B]"
                        : "text-[#181d26]/15"
                    }
                    fill={i < commitment.starRating ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
                {children.length === 1 ? "التزام بالمواعيد" : "التزام إجمالي"}:{" "}
                {commitment.committedInstallments} من{" "}
                {commitment.totalInstallments} أقساط
              </p>
            </div>
          )}

          {/* School card — logo + name on a light card bar (both optional) */}
          {(schoolLogo || schoolName) && (
            <div
              className="flex items-center justify-center gap-3 mt-3 mb-3 bg-white rounded-[14px] border px-4 py-3"
              style={{ borderColor: "#e0e2e6" }}
            >
              {schoolLogo && (
                <img
                  src={schoolLogo}
                  alt=""
                  className="w-10 h-10 rounded-lg object-contain bg-white flex-shrink-0"
                />
              )}
              {schoolName && (
                <p
                  className="text-[15px] font-bold text-center"
                  style={{ color: "#181d26" }}
                >
                  {schoolName}
                </p>
              )}
            </div>
          )}

          {/* Subtitle */}
          <p
            className="text-[13px] text-center mt-1"
            style={{ color: "#6B7280" }}
          >
            تابع الوضع المالي لأبنائك أولاً بأول.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-6 space-y-3">
        {flashMessage && (
          <div
            className="rounded-[14px] border p-3 flex items-start justify-between gap-3"
            style={{ backgroundColor: "#FCEBEB", borderColor: "#F0CFCF" }}
          >
            <p className="text-sm font-medium" style={{ color: "#A32D2D" }}>
              {flashMessage}
            </p>
            <button
              onClick={() => setFlashMessage(null)}
              className="flex-shrink-0 transition hover:opacity-70"
              style={{ color: "#A32D2D" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Summary hero — aggregate paid-vs-due across all the guardian's
            children as an SVG donut (paid % of total due), shown before any
            single child is opened. Card conventions match the rest of this
            file (bg-white, rounded, #e0e2e6 border). */}
        {!error && children.length > 0 && financeSummary && (() => {
          const ratio =
            financeSummary.totalDue > 0
              ? Math.min(
                  1,
                  Math.max(0, financeSummary.totalPaid / financeSummary.totalDue),
                )
              : 0;
          const pct = Math.round(ratio * 100);
          const RADIUS = 36;
          const CIRC = 2 * Math.PI * RADIUS;
          return (
            <div
              className="bg-white rounded-[16px] border p-5 flex items-center gap-5"
              style={{ borderColor: "#e0e2e6" }}
            >
              <div
                className="relative flex-shrink-0"
                style={{ width: 88, height: 88 }}
              >
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <circle
                    cx="44"
                    cy="44"
                    r={RADIUS}
                    fill="none"
                    stroke="#e0e2e6"
                    strokeWidth="10"
                  />
                  <circle
                    cx="44"
                    cy="44"
                    r={RADIUS}
                    fill="none"
                    stroke="#1b61c9"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - ratio)}
                    transform="rotate(-90 44 44)"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-[16px] font-bold"
                  style={{ color: "#1b61c9" }}
                >
                  {pct}%
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[11px] font-medium mb-1"
                  style={{ color: "#4B5563" }}
                >
                  إجمالي المدفوع {formatChildrenCount(financeSummary.studentCount)}
                </p>
                <p
                  className="text-[18px] font-bold leading-tight break-words mb-2"
                  style={{ color: "#1b61c9" }}
                >
                  {formatCurrency(financeSummary.totalPaid)}
                </p>
                <p
                  className="text-[11px] font-medium mb-1"
                  style={{ color: "#4B5563" }}
                >
                  إجمالي الرسوم
                </p>
                <p
                  className="text-[15px] font-bold leading-tight break-words"
                  style={{ color: "#181d26" }}
                >
                  {formatCurrency(financeSummary.totalDue)}
                </p>
              </div>
            </div>
          );
        })()}

        {error && (
          <div
            className="bg-white rounded-[18px] border px-6 py-8 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
              style={{ backgroundColor: "#FCEBEB" }}
            >
              <AlertCircle className="w-6 h-6" style={{ color: "#A32D2D" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "#A32D2D" }}>
              {error}
            </p>
          </div>
        )}

        {!error && children.length === 0 && (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
              style={{ backgroundColor: "#F8FAFC" }}
            >
              <Users className="w-6 h-6" style={{ color: "#94a3b8" }} />
            </div>
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا يوجد أبناء مسجّلون
            </p>
          </div>
        )}

        {/* Single-child guardian — one larger featured card (avatar + name +
            grade) with a full-width finance button below it. No per-row
            mini-rating here: the aggregate stars under the greeting already
            cover this one child. */}
        {!error && children.length === 1 && (
          <>
            <div className="flex items-center gap-2 px-1">
              <Users
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: "#1b61c9" }}
              />
              <h2 className="text-sm font-bold" style={{ color: "#181d26" }}>
                الأبناء
              </h2>
            </div>
            <div
              className="bg-white rounded-[14px] border p-5"
              style={{ borderColor: "#e0e2e6" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 text-base font-bold"
                  style={{ backgroundColor: "#e8f0fc", color: "#1b61c9" }}
                >
                  {children[0].name.trim().charAt(0) || "؟"}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="font-semibold truncate"
                    style={{ color: "#181d26" }}
                  >
                    {children[0].name}
                  </p>
                  {children[0].grade && (
                    <p
                      className="text-[13px] mt-0.5"
                      style={{ color: "#6B7280" }}
                    >
                      {children[0].grade}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/parent-dashboard/children/$studentId/finance",
                    params: { studentId: children[0].id },
                  })
                }
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-[12px] py-3 text-sm font-bold text-white transition hover:opacity-90 active:opacity-90"
                style={{ backgroundColor: "#1b61c9" }}
              >
                عرض التفاصيل المالية
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Multi-child guardian — compact row list. Row order: avatar,
            name+grade (the tap target), a compact 3-star mini-rating scaled
            from this child's own starRating, then the chevron cue. */}
        {!error && children.length > 1 && (
          <>
            <div className="flex items-center gap-2 px-1">
              <Users
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: "#1b61c9" }}
              />
              <h2 className="text-sm font-bold" style={{ color: "#181d26" }}>
                الأبناء
              </h2>
            </div>
            <div className="space-y-2">
              {children.map((child, i) => {
                const entry = commitment?.byStudent?.[i];
                const miniStars =
                  entry && entry.totalInstallments > 0
                    ? Math.round((entry.starRating / 5) * 3)
                    : null;
                return (
                  <div
                    key={child.id}
                    className="w-full bg-white rounded-[14px] border p-4 flex items-center gap-3 text-right transition hover:border-slate-300"
                    style={{ borderColor: "#e0e2e6" }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 text-sm font-bold"
                      style={{ backgroundColor: "#e8f0fc", color: "#1b61c9" }}
                    >
                      {child.name.trim().charAt(0) || "؟"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/parent-dashboard/children/$studentId/finance",
                          params: { studentId: child.id },
                        })
                      }
                      aria-label={`تفاصيل ${child.name}`}
                      className="min-w-0 flex-1 text-right cursor-pointer"
                    >
                      <span className="block truncate font-semibold transition-colors text-[#1b61c9] hover:text-[#1553a3] active:text-[#1553a3]">
                        {child.name}
                      </span>
                      {child.grade && (
                        <span
                          className="block text-[13px] mt-0.5"
                          style={{ color: "#6B7280" }}
                        >
                          {child.grade}
                        </span>
                      )}
                    </button>
                    {miniStars !== null && (
                      <div
                        className="flex items-center gap-0.5 flex-shrink-0"
                        role="img"
                        aria-label={`الالتزام ${miniStars} من 3`}
                      >
                        {[0, 1, 2].map((s) => (
                          <Star
                            key={s}
                            size={12}
                            strokeWidth={1.5}
                            className={
                              s < miniStars
                                ? "text-[#F5B301]"
                                : "text-[#D1D5DB]"
                            }
                            fill={s < miniStars ? "currentColor" : "none"}
                          />
                        ))}
                      </div>
                    )}
                    <ChevronLeft
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: "#1b61c9" }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bottom activity nudge — static prompt filling the space below the
            list, tapping through to the full recent-activity feed (same target
            as the header bell). Deliberately no data fetch here. */}
        {!error && children.length > 0 && (
          <button
            type="button"
            onClick={() => navigate({ to: "/parent-dashboard/activity" })}
            className="w-full flex items-center gap-3 rounded-[14px] p-3.5 text-right transition hover:opacity-90 active:opacity-90"
            style={{ backgroundColor: "#e8f0fc" }}
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 bg-white">
              <Activity className="w-4 h-4" style={{ color: "#1b61c9" }} />
            </span>
            <span
              className="flex-1 min-w-0 text-[13px] font-medium"
              style={{ color: "#1b61c9" }}
            >
              تحقق من آخر النشاطات المالية
            </span>
            <ChevronLeft
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "#1b61c9" }}
            />
          </button>
        )}
      </main>

      {/* Footer - Copyright */}
      <footer className="px-4 py-8">
        <div className="max-w-2xl mx-auto text-center space-y-1">
          <p
            className="text-[11px]"
            style={{ color: "#6B7280" }}
          >
            جميع الحقوق محفوظة © {new Date().getFullYear()} شركة nun
          </p>
          <p
            className="text-[12px] font-bold"
            style={{ color: "#6B7280" }}
          >
            AL-FARES Private Schools
          </p>
        </div>
      </footer>
    </div>
  );
}
