import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getActivityFeed,
  markActivitySeen,
  ApiError,
  type ParentActivity,
  type ParentActivityType,
} from "@/lib/api";
import {
  Loader2,
  AlertCircle,
  ChevronRight,
  History,
  CircleDollarSign,
  Receipt,
  BadgePercent,
  Undo2,
  XCircle,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Parent Portal — detailed recent-activity feed.
 *
 * GET /api/parent-portal/activity-feed returns a newest-first, server-capped
 * list of financial events across ALL of the guardian's children (new
 * payment / check returned / new fee / discount applied / payment cancelled),
 * each with its own timestamp. Reached from the bell in the header of the
 * children list. Events are grouped by day.
 */

/** Relative Arabic time for the line under each event. */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 30) return `منذ ${days} يوم`;
  return formatDate(iso);
}

/** Day bucket label: اليوم / أمس / dd/mm/yyyy. */
function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (dayDiff <= 0) return "اليوم";
  if (dayDiff === 1) return "أمس";
  return formatDate(iso);
}

const ACTIVITY_ICON_CONFIG: Record<
  ParentActivityType,
  { icon: ReactNode; bg: string; amountColor: string }
> = {
  payment: {
    icon: <CircleDollarSign className="w-[18px] h-[18px]" style={{ color: "var(--ok)" }} />,
    bg: "var(--ok-soft)",
    amountColor: "var(--ok)",
  },
  fee_charged: {
    icon: <Receipt className="w-[18px] h-[18px]" style={{ color: "var(--brand)" }} />,
    bg: "var(--brand-soft)",
    amountColor: "var(--ink)",
  },
  discount_applied: {
    icon: <BadgePercent className="w-[18px] h-[18px]" style={{ color: "var(--ok)" }} />,
    bg: "var(--ok-soft)",
    amountColor: "var(--ok)",
  },
  check_returned: {
    icon: <Undo2 className="w-[18px] h-[18px]" style={{ color: "var(--bad)" }} />,
    bg: "var(--bad-soft)",
    amountColor: "var(--bad)",
  },
  payment_cancelled: {
    icon: <XCircle className="w-[18px] h-[18px]" style={{ color: "var(--bad)" }} />,
    bg: "var(--bad-soft)",
    amountColor: "var(--bad)",
  },
};

function activityVisual(type: ParentActivityType): {
  icon: ReactNode;
  bg: string;
  amountColor: string;
} {
  return (
    ACTIVITY_ICON_CONFIG[type] ?? {
      icon: <History className="w-[18px] h-[18px]" style={{ color: "var(--ink-3)" }} />,
      bg: "var(--paper)",
      amountColor: "var(--ink)",
    }
  );
}

export default function ParentActivity() {
  const navigate = useNavigate();

  const [activities, setActivities] = useState<ParentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared in-flight guard so pull-to-refresh never fires overlapping fetches.
  const isFetchingRef = useRef(false);

  const fetchActivity = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const list = await getActivityFeed();
        setActivities(list);
        if (!background) setLoading(false);
        // "Opening the feed = read": advance the server cursor for next visit.
        // Fire-and-forget — the list shown this render is intentionally the
        // pre-mark value.
        void markActivitySeen().catch(() => {});
      } catch (err) {
        if (background) {
          console.error("Parent activity auto-refresh failed:", err);
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
    fetchActivity();
  }, [fetchActivity]);

  const {
    pullDistance,
    isRefreshing,
    pullProgress,
    handlePullTouchStart,
    handlePullTouchMove,
    handlePullTouchEnd,
  } = usePullToRefresh({
    onRefresh: () => fetchActivity({ background: true }),
    isFetchingRef,
  });

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

  // Newest-first list, grouped by consecutive day bucket.
  const groups: Array<{ label: string; items: ParentActivity[] }> = [];
  for (const item of activities) {
    const label = dayLabel(item.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

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

      <header className="hero-surface text-white px-4 pt-5 pb-7">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate({ to: "/parent-dashboard/children" })}
            className="chip-glass inline-flex items-center gap-1 rounded-md h-9 pr-2 pl-3.5 text-[14px] font-semibold mb-6"
          >
            <ChevronRight className="w-[18px] h-[18px]" />
            رجوع
          </button>
          <div className="rise" style={{ ["--i" as string]: 0 }}>
            <h1 className="text-[24px] font-extrabold leading-tight">
              النشاط المالي
            </h1>
            <p className="mt-1.5 text-[14px] text-white/80">
              كل ما استجد على حسابات أبنائك المالية.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 pb-10 space-y-5">
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

        {!error && activities.length === 0 && (
          <div className="bg-white rounded-lg px-6 py-10 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3"
              style={{ backgroundColor: "var(--paper)" }}
            >
              <History className="w-6 h-6" style={{ color: "var(--ink-3)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              لا يوجد نشاط حديث
            </p>
          </div>
        )}

        {!error &&
          groups.map((group, gi) => (
            <section key={`${group.label}-${gi}`}>
              <h2
                className="px-1 mb-2 text-[13px] font-bold"
                style={{ color: "var(--ink-2)" }}
              >
                {group.label}
              </h2>
              <ul className="bg-white rounded-lg px-4 divide-y" style={{ borderColor: "var(--line)" }}>
                {group.items.map((item, index) => {
                  const visual = activityVisual(item.type);
                  const sign = item.amount < 0 ? "- " : "";
                  return (
                    <li
                      key={`${item.type}-${item.timestamp ?? ""}-${index}`}
                      className="rise flex items-start gap-3 py-3.5"
                      style={{ ["--i" as string]: Math.min(gi * 3 + index, 8) }}
                    >
                      <span
                        className="inline-flex items-center justify-center w-10 h-10 rounded-md flex-shrink-0"
                        style={{ backgroundColor: visual.bg }}
                      >
                        {visual.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[14px] font-semibold leading-snug"
                          style={{ color: "var(--ink)" }}
                        >
                          {item.description}
                        </p>
                        <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                          <span className="font-semibold" style={{ color: "var(--brand)" }}>
                            {item.studentName}
                          </span>{" "}
                          · {formatRelativeTime(item.timestamp)}
                        </p>
                      </div>
                      {item.amount !== 0 && (
                        <span
                          className="text-[14px] font-bold flex-shrink-0 pt-0.5"
                          style={{ color: visual.amountColor }}
                        >
                          {sign}
                          {formatCurrency(Math.abs(item.amount))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </main>
    </div>
  );
}
