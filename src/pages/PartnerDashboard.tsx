import { useState, useEffect } from "react";
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
  FileX,
  CircleDollarSign,
  AlertTriangle,
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

  useEffect(() => {
    // Load avatar choice from localStorage
    const savedAvatar = localStorage.getItem("partner-avatar-choice");
    if (savedAvatar && AVATAR_OPTIONS.find(opt => opt.id === savedAvatar)) {
      setSelectedAvatar(savedAvatar);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      getFinanceStatistics(),
      getTopDebtors(10),
      getRecentTransactions(10),
      getCurrentUser(),
    ])
      .then(([s, d, t, u]) => {
        setStats(s);
        setDebtors(d);
        setTransactions(t);
        setUser(u);
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
  }, [navigate]);

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

  const { totals, students, account_status, checks, previous_dues } = stats;

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
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-3xl mx-auto">
          {/* Row 1: notification bell + logout icon, grouped on the left edge */}
          <div className="flex items-center justify-end gap-2 mb-4">
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
              {/* Notification dot badge - shows only when there are unread notifications */}
              {unreadCount > 0 && (
                <div
                  className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
                  style={{ backgroundColor: "#EF4444" }}
                />
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
          {/* Today badge */}
          <div
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{ backgroundColor: "#1b61c9", color: "white" }}
          >
            اليوم
          </div>
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
                <p className="text-xs text-[#6B7280] mb-1">إجمالي المحصّل اليوم</p>
                <p
                  className="text-2xl font-bold"
                  style={{ color: "#0C447C" }}
                >
                  {formatCurrency(totals.total_paid)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            3. 2-column metric cards
        ============================================================ */}
        <div className="grid grid-cols-2 gap-4">
          {/* Overdue Students */}
          <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg"
                  style={{ backgroundColor: "#FAEEDA" }}
                >
                  <AlertTriangle
                    className="w-4 h-4"
                    strokeWidth={2.2}
                    style={{ color: "#BA7517" }}
                  />
                </div>
                <span className="text-[13px] font-medium text-[#6B7280]">
                  عدد الطلاب المتأخرين
                </span>
              </div>
            </div>
            <p
              className="text-[22px] font-bold leading-tight"
              style={{ color: students.overdue_count > 0 ? "#BA7517" : "#181d26" }}
            >
              {formatNumber(students.overdue_count)}
            </p>
          </div>

          {/* Returned Checks */}
          <div className="bg-white rounded-[18px] border border-[#e0e2e6] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg"
                  style={{ backgroundColor: "#FCEBEB" }}
                >
                  <FileX
                    className="w-4 h-4"
                    strokeWidth={2.2}
                    style={{ color: "#A32D2D" }}
                  />
                </div>
                <span className="text-[13px] font-medium text-[#6B7280]">
                  شيكات مرجوعة
                </span>
              </div>
            </div>
            <p
              className="text-[22px] font-bold leading-tight"
              style={{ color: checks.returned > 0 ? "#A32D2D" : "#181d26" }}
            >
              {formatNumber(checks.returned)}
            </p>
            {checks.returned > 0 && (
              <p className="text-[13px] text-[#6B7280] mt-0.5">
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
              {(isExpanded ? transactions : transactions.slice(0, 3)).map((tx) => {
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
              {(isExpanded ? debtors : debtors.slice(0, 3)).map((debtor, idx) => (
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

        {/* Full-width toggle button */}
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
              عرض كل العمليات
            </>
          )}
        </button>
      </main>
    </div>
  );
}
