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
import { formatCurrency, firstName, computeGreeting } from "@/lib/format";

/**
 * Parent Portal — children list (multi-child guardians land here after
 * login; single-child guardians skip straight to the finance detail).
 *
 * Visual language copy-adapted from PartnerDashboard.tsx (time-of-day
 * greeting, school-branding header, semantic tints, rounded section cards) —
 * nothing in that file is exported, so the patterns are replicated here.
 */

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
        style={{ backgroundColor: "var(--paper)" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  const due = financeSummary?.totalDue ?? 0;
  const paid = financeSummary?.totalPaid ?? 0;
  const remaining = financeSummary?.balance ?? due - paid;
  const ratio = due > 0 ? Math.min(1, Math.max(0, paid / due)) : 0;
  const goToFinance = (id: string) =>
    navigate({
      to: "/parent-dashboard/children/$studentId/finance",
      params: { studentId: id },
    });

  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{ backgroundColor: "var(--paper)" }}
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        pullProgress={pullProgress}
      />

      <header className="hero-surface text-white px-4 pt-5 pb-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5 min-w-0">
              {schoolLogo && (
                <img
                  src={schoolLogo}
                  alt=""
                  className="w-9 h-9 rounded-md object-contain bg-white p-0.5 flex-shrink-0"
                />
              )}
              {schoolName && (
                <p className="text-[14px] font-semibold text-white/90 truncate">
                  {schoolName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <button
                  onClick={() => navigate({ to: "/parent-dashboard/activity" })}
                  className="chip-glass inline-flex items-center justify-center w-9 h-9 rounded-md"
                  aria-label={
                    unreadPayments > 0
                      ? `النشاط المالي — ${unreadPayments} دفعات جديدة`
                      : "النشاط المالي"
                  }
                >
                  <Bell className="w-[18px] h-[18px]" />
                </button>
                {unreadPayments > 0 && (
                  <span
                    className="absolute -top-1 -left-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold pointer-events-none"
                    style={{ backgroundColor: "#fff", color: "var(--brand-deep)" }}
                  >
                    {unreadPayments > 99 ? "99+" : unreadPayments}
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                aria-label="تسجيل خروج"
                className="chip-glass inline-flex items-center justify-center w-9 h-9 rounded-md"
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          <div className="rise" style={{ ["--i" as string]: 0 }}>
            <p className="flex items-center gap-1.5 text-[13px] text-white/75">
              {greeting.isNight ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
              {greeting.text}
            </p>
            <h1 className="mt-1 text-[24px] font-extrabold leading-tight">
              أهلاً، {firstName(guardianName)}
            </h1>
          </div>

          {commitment && commitment.totalInstallments > 0 && (
            <div
              className="rise mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"
              style={{ ["--i" as string]: 1 }}
            >
              <div
                className="flex items-center gap-0.5"
                role="img"
                aria-label={`الالتزام ${commitment.starRating} من 5`}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    size={13}
                    strokeWidth={1.5}
                    className={i < commitment.starRating ? "text-[#FBBF24]" : "text-white/30"}
                    fill={i < commitment.starRating ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <span className="text-[12px] text-white/85">
                {children.length === 1 ? "التزام بالمواعيد" : "التزام إجمالي"}:{" "}
                {commitment.committedInstallments} من {commitment.totalInstallments} أقساط
              </span>
            </div>
          )}

          {!error && children.length > 0 && financeSummary && (
            <div className="rise mt-6" style={{ ["--i" as string]: 2 }}>
              <p className="text-[13px] text-white/75">
                المتبقي {formatChildrenCount(financeSummary.studentCount)}
              </p>
              <p className="mt-0.5 text-[40px] font-extrabold leading-none tracking-tight">
                {formatCurrency(Math.max(0, remaining))}
              </p>
              <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-white/80">
                <span>إجمالي المدفوع {formatCurrency(paid)}</span>
                <span>إجمالي الرسوم {formatCurrency(due)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 space-y-4">
        {flashMessage && (
          <div
            role="alert"
            className="rounded-lg p-3.5 flex items-start justify-between gap-3"
            style={{ backgroundColor: "var(--bad-soft)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
              {flashMessage}
            </p>
            <button
              onClick={() => setFlashMessage(null)}
              aria-label="إغلاق"
              className="flex-shrink-0"
              style={{ color: "var(--bad)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-lg px-6 py-8 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3"
              style={{ backgroundColor: "var(--bad-soft)" }}
            >
              <AlertCircle className="w-6 h-6" style={{ color: "var(--bad)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
              {error}
            </p>
          </div>
        )}

        {!error && children.length === 0 && (
          <div className="bg-white rounded-lg px-6 py-10 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3"
              style={{ backgroundColor: "var(--paper)" }}
            >
              <Users className="w-6 h-6" style={{ color: "var(--ink-3)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              لا يوجد أبناء مسجّلون
            </p>
          </div>
        )}

        {!error && children.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 px-1 mb-2.5 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
              <Users className="w-4 h-4" strokeWidth={2.2} style={{ color: "var(--brand)" }} />
              الأبناء
            </h2>
            <div className="bg-white rounded-lg divide-y" style={{ borderColor: "var(--line)" }}>
              {children.map((child, i) => {
                const entry = commitment?.byStudent?.[i];
                const miniStars =
                  entry && entry.totalInstallments > 0
                    ? Math.round((entry.starRating / 5) * 3)
                    : null;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => goToFinance(child.id)}
                    aria-label={`تفاصيل ${child.name}`}
                    className="rise w-full flex items-center gap-3 px-4 py-3.5 text-right transition active:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl"
                    style={{ ["--i" as string]: i + 3, borderColor: "var(--line)" }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0 text-base font-bold"
                      style={{ backgroundColor: "var(--brand-soft)", color: "var(--brand)" }}
                    >
                      {child.name.trim().charAt(0) || "؟"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[15px]" style={{ color: "var(--ink)" }}>
                        {child.name}
                      </span>
                      {child.grade && (
                        <span className="block text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                          {child.grade}
                        </span>
                      )}
                    </span>
                    {miniStars !== null && children.length > 1 && (
                      <span
                        className="flex items-center gap-0.5 flex-shrink-0"
                        role="img"
                        aria-label={`الالتزام ${miniStars} من 3`}
                      >
                        {[0, 1, 2].map((st) => (
                          <Star
                            key={st}
                            size={12}
                            strokeWidth={1.5}
                            className={st < miniStars ? "text-[#F5B301]" : "text-[#D1D5DB]"}
                            fill={st < miniStars ? "currentColor" : "none"}
                          />
                        ))}
                      </span>
                    )}
                    <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ink-3)" }} />
                  </button>
                );
              })}
            </div>

            {children.length === 1 && (
              <button
                type="button"
                onClick={() => goToFinance(children[0].id)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-md h-12 text-[14px] font-bold text-white transition active:scale-[0.99]"
                style={{ backgroundColor: "var(--brand)" }}
              >
                عرض التفاصيل المالية
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </section>
        )}

        {!error && children.length > 0 && (
          <button
            type="button"
            onClick={() => navigate({ to: "/parent-dashboard/activity" })}
            className="w-full flex items-center gap-3 rounded-lg px-4 py-3.5 text-right transition active:opacity-90"
            style={{ backgroundColor: "var(--brand-soft)" }}
          >
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 bg-white">
              <Activity className="w-[18px] h-[18px]" style={{ color: "var(--brand)" }} />
            </span>
            <span className="flex-1 min-w-0 text-[14px] font-semibold" style={{ color: "var(--brand-deep)" }}>
              تحقق من آخر النشاطات المالية
            </span>
            <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: "var(--brand)" }} />
          </button>
        )}
      </main>

      <footer className="px-4 py-8">
        <div className="max-w-2xl mx-auto text-center space-y-1">
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            جميع الحقوق محفوظة © {new Date().getFullYear()} شركة nun
          </p>
          <p className="text-[12px] font-bold" style={{ color: "var(--ink-3)" }}>
            AL-FARES Private Schools
          </p>
        </div>
      </footer>
    </div>
  );
}
