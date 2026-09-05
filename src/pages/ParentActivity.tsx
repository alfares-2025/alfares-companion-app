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

/**
 * Parent Portal — detailed recent-activity feed (Batch 10).
 *
 * GET /api/parent-portal/activity-feed returns a newest-first, server-capped
 * list of financial events across ALL of the guardian's children (new
 * payment / check returned / new fee / discount applied / payment cancelled),
 * each with its own timestamp. Reached from the bell in ParentChildren's
 * header.
 *
 * Visual language copy-adapted from ParentChildren.tsx / Notifications.tsx:
 * #F8FAFC ground, #1b61c9 accent, rounded white section cards, RTL.
 */

/** Relative Arabic time — same buckets as Notifications.tsx. */
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
  // Older than a month — show the calendar date instead.
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  return "—";
}

const ACTIVITY_ICON_CONFIG: Record<
  ParentActivityType,
  { icon: ReactNode; bg: string }
> = {
  payment: {
    icon: <CircleDollarSign className="w-4 h-4" style={{ color: "#4F7A1F" }} />,
    bg: "#ECF3E4",
  },
  fee_charged: {
    icon: <Receipt className="w-4 h-4" style={{ color: "#1b61c9" }} />,
    bg: "#e8f0fc",
  },
  discount_applied: {
    icon: <BadgePercent className="w-4 h-4" style={{ color: "#4F7A1F" }} />,
    bg: "#ECF3E4",
  },
  check_returned: {
    icon: <Undo2 className="w-4 h-4" style={{ color: "#A32D2D" }} />,
    bg: "#FCEBEB",
  },
  payment_cancelled: {
    icon: <XCircle className="w-4 h-4" style={{ color: "#A32D2D" }} />,
    bg: "#FCEBEB",
  },
};

function activityVisual(type: ParentActivityType): { icon: ReactNode; bg: string } {
  return (
    ACTIVITY_ICON_CONFIG[type] ?? {
      icon: <History className="w-4 h-4" style={{ color: "#6B7280" }} />,
      bg: "#F8FAFC",
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
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        pullProgress={pullProgress}
      />

      <header className="px-4 pt-6 pb-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" style={{ color: "#1b61c9" }} />
              <span
                className="text-sm font-medium"
                style={{ color: "#6B7280" }}
              >
                آخر التحديثات
              </span>
            </div>
            <button
              onClick={() => navigate({ to: "/parent-dashboard/children" })}
              className="inline-flex items-center gap-1 rounded-lg h-8 px-2.5 text-[13px] font-medium transition hover:opacity-80"
              style={{ backgroundColor: "#e8f0fc", color: "#1b61c9" }}
            >
              <ChevronRight className="w-4 h-4" />
              رجوع
            </button>
          </div>

          <h1
            className="text-[22px] font-medium text-center"
            style={{ color: "#181d26" }}
          >
            النشاط المالي
          </h1>
          <p
            className="text-[13px] text-center mt-1"
            style={{ color: "#6B7280" }}
          >
            كل ما استجد على حسابات أبنائك المالية.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-6 space-y-3">
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

        {!error && activities.length === 0 && (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
              style={{ backgroundColor: "#F8FAFC" }}
            >
              <History className="w-6 h-6" style={{ color: "#94a3b8" }} />
            </div>
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا يوجد نشاط حديث
            </p>
          </div>
        )}

        {!error && activities.length > 0 && (
          <div className="space-y-2">
            {activities.map((item, index) => {
              const visual = activityVisual(item.type);
              return (
                <div
                  key={`${item.type}-${item.timestamp ?? ""}-${index}`}
                  className="bg-white rounded-[14px] border p-4 flex items-start gap-3 text-right"
                  style={{ borderColor: "#e0e2e6" }}
                >
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: visual.bg }}
                  >
                    {visual.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-semibold leading-snug"
                      style={{ color: "#181d26" }}
                    >
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "#1b61c9" }}
                      >
                        {item.studentName}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "#6B7280" }}
                      >
                        · {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
