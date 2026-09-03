import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getFinanceStatistics,
  getTopDebtors,
  getRecentTransactions,
  getCurrentUser,
  ApiError,
  type FinanceStatistics,
  type TopDebtor,
  type RecentTransaction,
  type AuthUser,
} from "@/lib/api";
import { useNotifications } from "@/contexts/NotificationsContext";
import {
  Loader2,
  AlertCircle,
  LogOut,
  TrendingUp,
  Users,
  CircleDollarSign,
  Receipt,
  ChevronDown,
  ChevronUp,
  Bell,
  User,
  UserCircle,
  Star,
  Shield,
  Smile,
  Award,
  X,
  Sun,
  Moon,
  Layers,
  History,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("en-US")} شيكل (₪)`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const PAYMENT_METHOD_STYLES: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700",
  check: "bg-blue-50 text-blue-700",
  transfer: "bg-violet-50 text-violet-700",
  card: "bg-amber-50 text-amber-700",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  check: "شيك",
  transfer: "تحويل",
  card: "بطاقة",
};

// Pull-to-refresh tuning (touch gesture on the dashboard)
const PULL_THRESHOLD = 72; // px the user must pull down before a refresh fires
const PULL_MAX = 110; // hard cap on how far the indicator travels
const PULL_RESISTANCE = 0.4; // finger movement past the threshold is damped by this factor

// Avatar options
type AvatarOption = {
  id: string;
  type: "letter" | "icon";
  bg: string;
  color: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const AVATAR_OPTIONS: AvatarOption[] = [
  // 2 Letter-based avatars with solid backgrounds and white text
  { id: "accent-blue", type: "letter", bg: "#1b61c9", color: "white" },
  { id: "teal-green", type: "letter", bg: "#1D9E75", color: "white" },
  // 6 Icon-based avatars with neutral background and accent-colored icons
  { id: "user-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: User },
  { id: "user-circle-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: UserCircle },
  { id: "star-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: Star },
  { id: "shield-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: Shield },
  { id: "smile-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: Smile },
  { id: "award-icon", type: "icon", bg: "#F8FAFC", color: "#1b61c9", icon: Award },
];

function methodPill(method: string): { label: string; className: string } {
  const key = method.toLowerCase();
  return {
    label: PAYMENT_METHOD_LABELS[key] ?? method,
    className: PAYMENT_METHOD_STYLES[key] ?? "bg-slate-100 text-slate-600",
  };
}

function renderAvatar(option: AvatarOption, user: AuthUser | null) {
  if (option.type === "icon" && option.icon) {
    const IconComponent = option.icon;
    return (
      <div style={{ color: option.color }}>
        <IconComponent className="w-4 h-4" />
      </div>
    );
  }
  return (
    <span className="text-sm font-bold" style={{ color: option.color }}>
      {user?.name?.charAt(0) || "؟"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
  iconBg: string;
  iconColor: string;
}

function MetricCard({
  icon,
  label,
  value,
  subValue,
  valueClassName,
  iconBg,
  iconColor,
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0e2e6] p-4 flex flex-col gap-3 transition hover:shadow-md hover:border-slate-300">
      <div className="flex items-center gap-2">
        <div
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <span className="text-[13px] font-medium text-[#6B7280]">{label}</span>
      </div>
      <div>
        <p
          className="text-[22px] font-bold leading-tight"
          style={{ color: valueClassName ?? "#181d26" }}
        >
          {value}
        </p>
        {subValue && (
          <p className="text-[13px] text-[#6B7280] mt-0.5">{subValue}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const { unreadCount, addNotification, markAllAsRead } = useNotifications();
  const [stats, setStats] = useState<FinanceStatistics | null>(null);
  const [debtors, setDebtors] = useState<TopDebtor[]>([]);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string>("accent-blue");
  const [showAvatarPopover, setShowAvatarPopover] = useState(false);
  const [greeting, setGreeting] = useState<{ text: string; icon: React.ReactNode }>({ text: "صباح الخير", icon: <Sun className="w-4 h-4" style={{ color: "#6B7280" }} /> });

  // Shared in-flight guard so pull-to-refresh and the 60s interval never
  // fire overlapping fetches.
  const isFetchingRef = useRef(false);
  // Pull-to-refresh gesture tracking (touch only)
  const pullStartYRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Update greeting based on time
  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      let greetingText: string;
      let greetingIcon: React.ReactNode;

      if (hour >= 5 && hour < 12) {
        greetingText = "صباح الخير";
        greetingIcon = <Sun className="w-4 h-4" style={{ color: "#6B7280" }} />;
      } else if (hour >= 12 && hour < 18) {
        greetingText = "مساء الخير";
        greetingIcon = <Sun className="w-4 h-4" style={{ color: "#6B7280" }} />;
      } else {
        greetingText = "مساء الخير";
        greetingIcon = <Moon className="w-4 h-4" style={{ color: "#6B7280" }} />;
      }

      setGreeting({ text: greetingText, icon: greetingIcon });
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 5 * 60 * 1000); // Update every 5 minutes

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load avatar choice from localStorage
    const savedAvatar = localStorage.getItem("partner-avatar-choice");
    if (savedAvatar && AVATAR_OPTIONS.find(opt => opt.id === savedAvatar)) {
      setSelectedAvatar(savedAvatar);
    }
  }, []);

  const fetchDashboardData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      // Skip if a fetch (pull-to-refresh or interval) is already running.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const [s, d, t, u] = await Promise.all([
          getFinanceStatistics(),
          getTopDebtors(10),
          getRecentTransactions(10),
          getCurrentUser(),
        ]);
        setStats(s);
        setDebtors(d);
        setTransactions(t);
        setUser(u);
        if (!background) setLoading(false);
      } catch (err) {
        if (background) {
          // Silent background auto-refresh failure — keep the last
          // successful data on screen and do not disrupt the UI.
          console.error("Dashboard auto-refresh failed:", err);
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
    fetchDashboardData();
    const interval = setInterval(() => {
      // Skip this tick if a pull-to-refresh (or a previous tick) is in flight.
      if (!isFetchingRef.current) {
        fetchDashboardData({ background: true });
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // ---------------------------------------------------------------------------
  // Pull-to-refresh — touch-only gesture: pull down from the very top to refresh
  // ---------------------------------------------------------------------------
  const isAtScrollTop = () =>
    (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  const handlePullTouchStart = (e: React.TouchEvent) => {
    // Only arm the gesture when idle and already scrolled to the very top.
    if (isRefreshing || isFetchingRef.current) return;
    if (!isAtScrollTop()) return;
    pullStartYRef.current = e.touches[0].clientY;
    pullActiveRef.current = true;
  };

  const handlePullTouchMove = (e: React.TouchEvent) => {
    if (!pullActiveRef.current || pullStartYRef.current === null) return;
    // Abort if the user has scrolled away from the top mid-gesture.
    if (!isAtScrollTop()) {
      pullActiveRef.current = false;
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // 1:1 up to the threshold, damped past it, hard-capped at PULL_MAX.
    const damped =
      delta <= PULL_THRESHOLD
        ? delta
        : PULL_THRESHOLD + (delta - PULL_THRESHOLD) * PULL_RESISTANCE;
    setPullDistance(Math.min(damped, PULL_MAX));
  };

  const handlePullTouchEnd = () => {
    if (!pullActiveRef.current) return;
    pullActiveRef.current = false;
    pullStartYRef.current = null;
    if (pullDistance >= PULL_THRESHOLD && !isFetchingRef.current) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      Promise.resolve(fetchDashboardData({ background: true })).finally(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      });
    } else {
      // Released before the threshold — snap back with no refresh.
      setPullDistance(0);
    }
  };

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  // ---- Loading ----
  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1b61c9" }} />
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4"
      >
        <div className="bg-white rounded-2xl border border-[#e0e2e6] px-6 py-8 text-center max-w-sm w-full">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-rose-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const {
    totals,
    students,
    account_status,
    checks,
    previous_dues,
    monthly_collections,
    installments,
  } = stats;

  // Peak month used to scale the monthly-collections bars (1.5x headroom).
  const maxMonthlyCollection = Math.max(
    ...monthly_collections.map((m) => m.amount),
    1,
  );

  // Installments status breakdown (counts) — متأخر / مستحق / جاري / مدفوع
  const installmentsTotalCount =
    installments.overdue +
    installments.due +
    installments.partial +
    installments.paid;
  const installmentSegments = [
    { key: "overdue", label: "متأخر", count: installments.overdue, bg: "#FCEBEB", border: "#F0CFCF", text: "#A32D2D", bar: "#A32D2D" },
    { key: "due", label: "مستحق", count: installments.due, bg: "#e8f0fc", border: "#c5d8f0", text: "#1b61c9", bar: "#1b61c9" },
    { key: "partial", label: "جاري", count: installments.partial, bg: "#f1f5f9", border: "#e0e2e6", text: "#64748b", bar: "#94a3b8" },
    { key: "paid", label: "مدفوع", count: installments.paid, bg: "#ECF3E4", border: "#D0E0BD", text: "#4F7A1F", bar: "#639922" },
  ];
  const installmentPct = (count: number) =>
    installmentsTotalCount > 0 ? (count / installmentsTotalCount) * 100 : 0;

  // Previous dues source split — مشمول في الرسوم / مستقل
  const previousDuesSources = [
    { key: "included", label: "مشمول في الرسوم", amount: previous_dues.included_in_fees, color: "#1b61c9" },
    { key: "independent", label: "مستقل", amount: previous_dues.independent, color: "#94a3b8" },
  ];
  const previousDuesSourceTotal =
    previous_dues.included_in_fees + previous_dues.independent;

  const statusSegments = [
    { label: "مدفوع كامل", count: account_status.paid_full, color: "#639922" },
    { label: "جزئي ومستحق", count: account_status.partial + account_status.due, color: "#BA7517" },
    { label: "متأخر", count: account_status.overdue, color: "#A32D2D" },
  ];
  const statusTotalForSegments =
    account_status.paid_full +
    (account_status.partial + account_status.due) +
    account_status.overdue;
  const statusTotal =
    account_status.paid_full +
    (account_status.partial + account_status.due) +
    account_status.overdue;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F8FAFC]"
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      {/* Pull-to-refresh indicator (touch only) */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
        style={{
          transform: `translateY(${(isRefreshing ? PULL_THRESHOLD : pullDistance) - 44}px)`,
          opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
          transition:
            pullDistance > 0 && !isRefreshing
              ? "opacity 0.2s ease"
              : "transform 0.2s ease, opacity 0.2s ease",
        }}
      >
        <div className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e0e2e6] bg-white">
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#1b61c9" }} />
          ) : (
            <ChevronDown
              className="h-4 w-4"
              style={{
                color: pullProgress >= 1 ? "#1b61c9" : "#6B7280",
                transform: `rotate(${pullProgress * 180}deg)`,
                transition: "transform 0.12s linear, color 0.12s linear",
              }}
            />
          )}
        </div>
      </div>
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-3xl mx-auto">
          {/* Row 1: greeting (right) + notification bell + logout icon (left) */}
          <div className="flex items-center justify-between mb-4">
            {/* Time-based greeting */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#6B7280]">
                {greeting.text}
              </span>
              {greeting.icon}
            </div>
            {/* Notification Bell + Logout */}
            <div className="flex items-center gap-2">
              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => {
                    markAllAsRead();
                    navigate({ to: "/partner-dashboard/notifications" });
                  }}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                  style={{ backgroundColor: "#e8f0fc" }}
                >
                  <Bell className="w-4 h-4" style={{ color: "#1b61c9" }} />
                </button>
                {/* Notification badge - shows count when there are unread notifications */}
                {unreadCount > 0 && (
                  <div
                    className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white border-2 border-white"
                    style={{ backgroundColor: "#EF4444" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </div>
                )}
              </div>
              {/* Logout */}
              <button
                onClick={() => navigate({ to: "/login" })}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#181d26] transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Row 2: avatar, centered */}
          <div className="flex justify-center mb-3 relative">
            <button
              onClick={() => setShowAvatarPopover(!showAvatarPopover)}
              className="inline-flex items-center justify-center w-[36px] h-[36px] rounded-full transition hover:scale-105"
              style={{ backgroundColor: AVATAR_OPTIONS.find(opt => opt.id === selectedAvatar)?.bg || "#e8f0fc" }}
            >
              {renderAvatar(AVATAR_OPTIONS.find(opt => opt.id === selectedAvatar) || AVATAR_OPTIONS[0], user)}
            </button>

            {/* Avatar Popover */}
            {showAvatarPopover && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white rounded-xl border border-[#e0e2e6] shadow-lg p-3 z-50 w-64">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[#181d26]">اختر الصورة الرمزية</span>
                  <button
                    onClick={() => setShowAvatarPopover(false)}
                    className="text-[#6B7280] hover:text-[#181d26] transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setSelectedAvatar(option.id);
                        localStorage.setItem("partner-avatar-choice", option.id);
                        setShowAvatarPopover(false);
                      }}
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-lg transition hover:scale-105 ${
                        selectedAvatar === option.id ? "ring-2 ring-[#1b61c9]" : ""
                      }`}
                      style={{ backgroundColor: option.bg }}
                    >
                      {renderAvatar(option, user)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Row 3: greeting heading, centered */}
          <h1 className="text-[22px] font-medium text-[#181d26] text-center">
            أهلاً، {user?.name?.split(" ")[0] || "المستخدم"}
          </h1>
          {/* Row 4: muted subtitle, centered */}
          <p className="text-[13px] text-[#6B7280] text-center mt-1">
            هيك بتبقى عالصورة بمالية مدرستك أول بأول.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-6 space-y-4">
        {/* ============================================================
            2. Hero card — collection rate with gradient SVG donut
        ============================================================ */}
        <div
          className="rounded-[20px] p-6"
          style={{ backgroundColor: "#e8f0fc" }}
        >
          <div className="flex items-center gap-6">
            {/* SVG Donut Ring with gradient */}
            <div className="relative w-[92px] h-[92px] flex-shrink-0">
              <svg
                width="92"
                height="92"
                viewBox="0 0 92 92"
                className="transform -rotate-90"
              >
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#639922" />
                    <stop offset="100%" stopColor="#1b61c9" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <circle
                  cx="46"
                  cy="46"
                  r="36"
                  fill="none"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="10"
                />
                {/* Progress with gradient */}
                <circle
                  cx="46"
                  cy="46"
                  r="36"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(Math.min(totals.collection_rate, 100) / 100) * 2 * Math.PI * 36} ${2 * Math.PI * 36}`}
                />
              </svg>
              {/* Centered percentage */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-xl font-bold"
                  style={{ color: "#0C447C" }}
                >
                  {totals.collection_rate}%
                </span>
              </div>
            </div>
            {/* Stats */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-[#6B7280] mb-1">إجمالي المستحق</p>
                <p
                  className="text-2xl font-bold"
                  style={{ color: "#0C447C" }}
                >
                  {formatCurrency(totals.total_due)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            Financial totals — student count / total due / remaining.
            Student count is styled like إجمالي الأقساط: full-width row
            with larger text, positioned above total due.
        ============================================================ */}
        {/* Student count — full-width row */}
        <div
          className="rounded-[14px] border p-3 flex items-center justify-between gap-2"
          style={{ backgroundColor: "#F8FAFC", borderColor: "#e0e2e6" }}
        >
          <span className="text-[12px] font-semibold text-[#4B5563]">
            عدد الطلاب
          </span>
          <span className="text-[14px] font-bold text-[#181d26] whitespace-nowrap">
            {formatNumber(students.with_fee_account)}
          </span>
        </div>

        {/* Total Due and Remaining — 2-column grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total collected — accent tint */}
          <div
            className="rounded-[14px] border p-3 flex flex-col gap-1"
            style={{ backgroundColor: "#e8f0fc", borderColor: "#c5d8f0" }}
          >
            <span className="text-[11px] font-medium text-[#4B5563]">
              إجمالي المحصّل
            </span>
            <p
              className="text-[14px] font-bold leading-tight break-words"
              style={{ color: "#1b61c9" }}
            >
              {formatCurrency(totals.total_paid)}
            </p>
          </div>

          {/* Remaining — amber tint */}
          <div
            className="rounded-[14px] border p-3 flex flex-col gap-1"
            style={{ backgroundColor: "#FAEEDA", borderColor: "#EAD8B0" }}
          >
            <span className="text-[11px] font-medium text-[#4B5563]">
              المتبقي
            </span>
            <p
              className="text-[14px] font-bold leading-tight break-words"
              style={{ color: totals.total_remaining > 0 ? "#BA7517" : "#181d26" }}
            >
              {formatCurrency(totals.total_remaining)}
            </p>
          </div>
        </div>

        {/* ============================================================
            3. 2-column metric cells — rose tint. Same inner-cell spec as
               above / the الأقساط الدراسية status cells.
        ============================================================ */}
        <div className="grid grid-cols-2 gap-3">
          {/* Overdue Students — rose tint, count as a top-left corner badge */}
          <div
            className="rounded-[14px] border p-3 flex flex-col gap-1 relative"
            style={{ backgroundColor: "#FCEBEB", borderColor: "#F0CFCF" }}
          >
            <span
              className="absolute top-2 left-2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: students.overdue_count > 0 ? "#A32D2D" : "#181d26" }}
            >
              {formatNumber(students.overdue_count)}
            </span>
            <span className="text-[11px] font-medium text-[#4B5563] pl-8">
              عدد الطلاب المتأخرين
            </span>
          </div>

          {/* Returned Checks — rose tint, count as a top-left corner badge */}
          <div
            className="rounded-[14px] border p-3 flex flex-col gap-1 relative"
            style={{ backgroundColor: "#FCEBEB", borderColor: "#F0CFCF" }}
          >
            <span
              className="absolute top-2 left-2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: checks.returned > 0 ? "#A32D2D" : "#181d26" }}
            >
              {formatNumber(checks.returned)}
            </span>
            <span className="text-[11px] font-medium text-[#4B5563] pl-8">
              شيكات مرجوعة
            </span>
            {checks.returned > 0 && (
              <p className="text-[11px] text-[#6B7280] break-words mt-0.5">
                {formatCurrency(checks.returned_amount)}
              </p>
            )}
          </div>
        </div>

        {/* ============================================================
            4. Account status — SVG donut chart with legend
        ============================================================ */}
        <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users
              className="w-4 h-4"
              strokeWidth={2.2}
              style={{ color: "#1b61c9" }}
            />
            <h2 className="text-sm font-bold text-[#181d26]">حالة الحسابات</h2>
          </div>

          <div className="flex items-center gap-6">
            {/* SVG Donut Chart */}
            {statusTotalForSegments > 0 && (
              <div className="relative w-[76px] h-[76px] flex-shrink-0">
                <svg
                  width="76"
                  height="76"
                  viewBox="0 0 76 76"
                  className="transform -rotate-90"
                >
                  {/* Segment 1: Paid Full - Green */}
                  {account_status.paid_full > 0 && (
                    <circle
                      cx="38"
                      cy="38"
                      r="26"
                      fill="none"
                      stroke="#639922"
                      strokeWidth="12"
                      strokeDasharray={`${(account_status.paid_full / statusTotalForSegments) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
                      strokeDashoffset={0}
                    />
                  )}
                  {/* Segment 2: Partial + Due - Amber */}
                  {(account_status.partial + account_status.due) > 0 && (
                    <circle
                      cx="38"
                      cy="38"
                      r="26"
                      fill="none"
                      stroke="#BA7517"
                      strokeWidth="12"
                      strokeDasharray={`${((account_status.partial + account_status.due) / statusTotalForSegments) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
                      strokeDashoffset={-(account_status.paid_full / statusTotalForSegments) * 2 * Math.PI * 26}
                    />
                  )}
                  {/* Segment 3: Overdue - Red */}
                  {account_status.overdue > 0 && (
                    <circle
                      cx="38"
                      cy="38"
                      r="26"
                      fill="none"
                      stroke="#A32D2D"
                      strokeWidth="12"
                      strokeDasharray={`${(account_status.overdue / statusTotalForSegments) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
                      strokeDashoffset={-((account_status.paid_full + account_status.partial + account_status.due) / statusTotalForSegments) * 2 * Math.PI * 26}
                    />
                  )}
                </svg>
              </div>
            )}

            {/* Legend */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: "#639922" }}
                  />
                  <span className="text-sm text-[#6B7280]">مدفوع كامل</span>
                </div>
                <span className="text-sm font-bold text-[#181d26]">
                  {formatNumber(account_status.paid_full)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: "#BA7517" }}
                  />
                  <span className="text-sm text-[#6B7280]">جزئي ومستحق</span>
                </div>
                <span className="text-sm font-bold text-[#181d26]">
                  {formatNumber(account_status.partial + account_status.due)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: "#A32D2D" }}
                  />
                  <span className="text-sm text-[#6B7280]">متأخر</span>
                </div>
                <span className="text-sm font-bold text-[#181d26]">
                  {formatNumber(account_status.overdue)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            Monthly collections — horizontal bar per month
        ============================================================ */}
        <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp
              className="w-4 h-4"
              strokeWidth={2.2}
              style={{ color: "#1b61c9" }}
            />
            <h2 className="text-sm font-bold text-[#181d26]">التحصيلات الشهرية</h2>
          </div>

          {monthly_collections.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-6">
              لا توجد بيانات تحصيل شهرية
            </p>
          ) : (
            <div className="space-y-2">
              {monthly_collections.map((month) => {
                // Scale against 1.5x the peak so no bar ever fills the full track.
                const percentage = Math.min(
                  (month.amount / (maxMonthlyCollection * 1.5)) * 100,
                  100,
                );
                return (
                  <div
                    key={month.month_label}
                    className="p-3 rounded-lg bg-[#F8FAFC]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-[#6B7280] whitespace-nowrap">
                        {month.month_label}
                      </span>
                      <span className="text-[13px] font-bold text-[#181d26] whitespace-nowrap">
                        {formatCurrency(month.amount)}
                      </span>
                    </div>
                    <div className="w-full bg-[#e0e2e6] rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: "#1b61c9",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ============================================================
            Installments breakdown — الأقساط الدراسية
        ============================================================ */}
        <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Layers
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: "#1b61c9" }}
              />
              <h2 className="text-sm font-bold text-[#181d26]">الأقساط الدراسية</h2>
            </div>
            <span className="text-[12px] font-medium text-[#6B7280] whitespace-nowrap">
              {formatNumber(installmentsTotalCount)} قسط
            </span>
          </div>

          {/* Total installments value */}
          <div
            className="rounded-[14px] border p-3 mb-3 flex items-center justify-between gap-2"
            style={{ backgroundColor: "#F8FAFC", borderColor: "#e0e2e6" }}
          >
            <span className="text-[12px] font-semibold text-[#4B5563]">
              إجمالي الأقساط
            </span>
            <span className="text-[14px] font-bold text-[#181d26] whitespace-nowrap">
              {formatCurrency(installments.total_value)}
            </span>
          </div>

          {/* Status grid (2×2 on mobile) */}
          <div className="grid grid-cols-2 gap-2">
            {installmentSegments.map((seg) => (
              <div
                key={seg.key}
                className="rounded-[14px] border p-3 flex flex-col gap-1"
                style={{ backgroundColor: seg.bg, borderColor: seg.border }}
              >
                <span className="text-[11px] font-medium text-[#4B5563]">
                  {seg.label}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-[18px] font-bold leading-none"
                    style={{ color: seg.text }}
                  >
                    {formatNumber(seg.count)}
                  </span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: seg.text }}
                  >
                    ({installmentPct(seg.count).toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Segmented proportion bar */}
          {installmentsTotalCount > 0 && (
            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-[#e0e2e6]">
              {installmentSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="h-2"
                  style={{
                    width: `${installmentPct(seg.count)}%`,
                    backgroundColor: seg.bar,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ============================================================
            Previous-period dues — الذمم السابقة
        ============================================================ */}
        <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <History
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: "#1b61c9" }}
              />
              <h2 className="text-sm font-bold text-[#181d26]">الذمم السابقة</h2>
            </div>
            <span className="text-[12px] font-medium text-[#6B7280] whitespace-nowrap">
              {previous_dues.students_count === 1
                ? "طالب واحد"
                : `${formatNumber(previous_dues.students_count)} طلاب`}
            </span>
          </div>

          {/* 4 stat rows — full-width tinted line items (currency strings need
              the room; matches the "إجمالي الأقساط" row style above) */}
          <div className="space-y-2">
            {[
              {
                key: "remaining",
                label: "المتبقي",
                value: formatCurrency(previous_dues.remaining),
                bg: "#FAEEDA",
                border: "#EAD8B0",
                color: previous_dues.remaining > 0 ? "#BA7517" : "#181d26",
              },
              {
                key: "students",
                label: "عدد الطلاب",
                value: formatNumber(previous_dues.students_count),
                bg: "#F8FAFC",
                border: "#e0e2e6",
                color: "#181d26",
              },
              {
                key: "paid",
                label: "المدفوع",
                value: formatCurrency(previous_dues.paid),
                bg: "#ECF3E4",
                border: "#D0E0BD",
                color: "#4F7A1F",
              },
              {
                key: "total",
                label: "إجمالي الذمم",
                value: formatCurrency(previous_dues.total),
                bg: "#e8f0fc",
                border: "#c5d8f0",
                color: "#1b61c9",
              },
            ].map((s) => (
              <div
                key={s.key}
                className="rounded-[14px] border p-3 flex items-center justify-between gap-3"
                style={{ backgroundColor: s.bg, borderColor: s.border }}
              >
                <span className="text-[12px] font-semibold text-[#4B5563] whitespace-nowrap">
                  {s.label}
                </span>
                <span
                  className="text-[14px] font-bold whitespace-nowrap"
                  style={{ color: s.color }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Source distribution — توزيع مصدر الذمم */}
          <div className="mt-4 pt-4 border-t border-[#e0e2e6]">
            <p className="text-[12px] font-semibold text-[#4B5563] mb-3">
              توزيع مصدر الذمم
            </p>

            {previous_dues.total === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-4">
                لا توجد ذمم سابقة
              </p>
            ) : previousDuesSourceTotal === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-4">
                لا يوجد تفصيل لمصدر الذمم
              </p>
            ) : (
              <>
                {/* Segmented bar */}
                <div className="flex h-2.5 rounded-full overflow-hidden bg-[#e0e2e6] mb-3">
                  {previousDuesSources.map((src) => (
                    <div
                      key={src.key}
                      className="h-2.5"
                      style={{
                        width: `${(src.amount / previousDuesSourceTotal) * 100}%`,
                        backgroundColor: src.color,
                      }}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="space-y-1.5">
                  {previousDuesSources.map((src) => (
                    <div
                      key={src.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: src.color }}
                        />
                        <span className="text-[12px] text-[#6B7280] truncate">
                          {src.label}
                        </span>
                      </span>
                      <span className="text-[12px] font-bold text-[#181d26] whitespace-nowrap">
                        {formatCurrency(src.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============================================================
            Collapsible detail sections — hidden on load; the "عرض المزيد"
            button below reveals / hides آخر العمليات + أعلى المديونيات
            together via isExpanded.
        ============================================================ */}
        {isExpanded && (
          <>
            {/* ============================================================
                5. Recent transactions
            ============================================================ */}
            <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Receipt
                  className="w-4 h-4"
                  strokeWidth={2.2}
                  style={{ color: "#1b61c9" }}
                />
                <h2 className="text-sm font-bold text-[#181d26]">آخر العمليات</h2>
              </div>

              {transactions.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-6">
                  لا توجد عمليات حديثة
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => {
                    const pill = methodPill(tx.payment_method);
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#181d26] truncate">
                            {tx.student_name}
                          </p>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {formatDate(tx.date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${pill.className}`}
                          >
                            {pill.label}
                          </span>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ============================================================
                6. Top debtors
            ============================================================ */}
            <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
              <div className="flex items-center gap-2 mb-4">
                <CircleDollarSign
                  className="w-4 h-4"
                  strokeWidth={2.2}
                  style={{ color: "#1b61c9" }}
                />
                <h2 className="text-sm font-bold text-[#181d26]">أعلى المديونيات</h2>
              </div>

              {debtors.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-6">
                  لا توجد مديونيات
                </p>
              ) : (
                <div className="space-y-2">
                  {debtors.map((debtor, idx) => (
                    <div
                      key={debtor.id}
                      className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold flex-shrink-0"
                          style={{
                            backgroundColor: idx < 3 ? "#fff1f2" : "#f1f5f9",
                            color: idx < 3 ? "#e11d48" : "#6B7280",
                          }}
                        >
                          {(idx + 1).toLocaleString("en-US")}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#181d26] truncate">
                            {debtor.name}
                          </p>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {debtor.class}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-rose-600 flex-shrink-0">
                        {formatCurrency(debtor.remaining)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Full-width reveal / collapse toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-[16px] text-white font-medium transition hover:opacity-90"
          style={{ backgroundColor: "#1b61c9" }}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-5 h-5" />
              عرض أقل
            </>
          ) : (
            <>
              <ChevronDown className="w-5 h-5" />
              عرض المزيد
            </>
          )}
        </button>
      </main>
    </div>
  );
}
