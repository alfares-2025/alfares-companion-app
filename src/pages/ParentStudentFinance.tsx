import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getStudentFinance,
  getParentChildren,
  getSchoolLogo,
  parentLogout,
  ApiError,
  type ParentStudentFinance as ParentStudentFinanceData,
} from "@/lib/api";
import {
  Loader2,
  AlertCircle,
  ChevronRight,
  LogOut,
  Wallet,
  CircleDollarSign,
  Receipt,
  History,
  Calendar,
  Sun,
  Moon,
  Star,
  Bell,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";

// Local copies of PartnerDashboard.tsx's formatting helpers — that file
// doesn't export them, so they're replicated here rather than imported.
function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("en-US")} شيكل (₪)`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return value;
  }
}

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  check: "شيك",
  cheque: "شيك",
  transfer: "تحويل",
  card: "بطاقة",
};

const INSTALLMENT_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  paid: {
    label: "مدفوع",
    bg: "#ECF3E4",
    text: "#4F7A1F",
    border: "#D0E0BD",
  },
  partial: {
    label: "جزئي",
    bg: "#FAEEDA",
    text: "#BA7517",
    border: "#F5D9B0",
  },
  overdue: {
    label: "متأخر",
    bg: "#FCEBEB",
    text: "#A32D2D",
    border: "#F0CFCF",
  },
  unpaid: {
    label: "غير مدفوع",
    bg: "#F8FAFC",
    text: "#6B7280",
    border: "#e0e2e6",
  },
};

function getInstallmentStatus(status: string | null | undefined): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  const normalized = (status ?? "").toLowerCase().trim();
  return (
    INSTALLMENT_STATUS_CONFIG[normalized] ?? {
      label: status || "غير مدفوع",
      bg: "#F8FAFC",
      text: "#6B7280",
      border: "#e0e2e6",
    }
  );
}

/** MetricCard — copy-adapted from PartnerDashboard.tsx (lines ~144-177). */
function MetricCard({
  icon,
  label,
  value,
  valueColor,
  iconBg,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  iconBg: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl border p-4 flex flex-col gap-3 transition hover:shadow-md"
      style={{ borderColor: "#e0e2e6" }}
    >
      <div className="flex items-center gap-2">
        <div
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <span className="text-[13px] font-medium" style={{ color: "#6B7280" }}>
          {label}
        </span>
      </div>
      <p
        className="text-[18px] font-bold leading-tight break-words"
        style={{ color: valueColor ?? "#181d26" }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Parent Portal — one student's read-only finance summary
 * (GET /api/parent-portal/students/:studentId/finance, Batch 3).
 *
 * Visual language copy-adapted from PartnerDashboard.tsx: the branded/greeting
 * header, the hero collection-ring (lines ~626-689), MetricCard stat cells
 * and grouped section cards. Behaviour (routing, fetching, 401/403 handling)
 * is unchanged.
 */
export default function ParentStudentFinance() {
  const navigate = useNavigate();
  // strict: false — this page isn't co-located with its route definition
  // (code-based routing in router.tsx, not createFileRoute), so params are
  // read generically rather than via a route object's own .useParams().
  const { studentId } = useParams({ strict: false }) as {
    studentId?: string;
  };

  const [finance, setFinance] = useState<ParentStudentFinanceData | null>(
    null,
  );
  const [hasMultipleChildren, setHasMultipleChildren] = useState(false);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"installments" | "payments">(
    "installments",
  );

  const [greeting, setGreeting] = useState(computeGreeting);
  
  // Shared in-flight guard so pull-to-refresh never fires overlapping fetches.
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setGreeting(computeGreeting()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const fetchFinanceData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      // Skip if a fetch (pull-to-refresh) is already running.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      
      if (!studentId) {
        navigate({ to: "/parent-dashboard/children" });
        isFetchingRef.current = false;
        return;
      }

      try {
        // Fetched together: the finance data itself; the guardian's full child
        // list (for the >1-child back/logout switch, this student's own name, and
        // the header greeting name/school); and the school logo (best-effort — its
        // own heavier endpoint, must never break the page).
        const [financeData, childrenData, logo] = await Promise.all([
          getStudentFinance(studentId),
          getParentChildren(),
          getSchoolLogo().catch(() => ({ schoolLogo: null as string | null })),
        ]);
        
        setFinance(financeData);
        setHasMultipleChildren(childrenData.students.length > 1);
        setGuardianName(childrenData.guardianName);
        setSchoolName(childrenData.schoolName);
        setSchoolLogo(logo.schoolLogo);
        const match = childrenData.students.find(
          (c) => String(c.id) === String(studentId),
        );
        setStudentName(match?.name ?? null);
        if (!background) setLoading(false);
      } catch (err) {
        if (background) {
          // Silent background auto-refresh failure — keep the last
          // successful data on screen and do not disrupt the UI.
          console.error("Parent finance auto-refresh failed:", err);
          return;
        }
        setLoading(false);
        if (err instanceof ApiError) {
          if (err.status === 401) {
            navigate({ to: "/login" });
            return;
          }
          if (err.status === 403) {
            // Shouldn't normally be reachable from this UI (a guardian can
            // only ever tap their own children), but handled defensively —
            // send them back to the list with an inline error rather than a
            // blank crash, instead of leaking anything about this studentId.
            navigate({
              to: "/parent-dashboard/children",
              search: {
                error:
                  err.message || "غير مصرح لك بالوصول إلى بيانات هذا الطالب.",
              },
            });
            return;
          }
          setError(err.message);
        } else {
          setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
        }
      } finally {
        isFetchingRef.current = false;
      }
    },
    [studentId, navigate],
  );

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  // Pull-to-refresh
  const {
    pullDistance,
    isRefreshing,
    pullProgress,
    handlePullTouchStart,
    handlePullTouchMove,
    handlePullTouchEnd,
  } = usePullToRefresh({
    onRefresh: () => fetchFinanceData({ background: true }),
    isFetchingRef,
  });

  async function handleLogout() {
    try {
      await parentLogout();
    } catch {
      // Ignore — still navigate to /login below regardless.
    } finally {
      navigate({ to: "/login" });
    }
  }

  // ---- Loading ----
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

  // ---- Error ----
  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#F8FAFC" }}
      >
        <div
          className="bg-white rounded-[18px] border px-6 py-8 text-center max-w-sm w-full"
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
      </div>
    );
  }

  if (!finance) return null;

  const {
    account,
    feeItems,
    payments,
    academicPeriodId,
    installments = [],
  } = finance;

  // Paid-vs-due ratio for the hero ring. No `collection_rate` on the parent
  // finance payload, so derive it; clamp for the overpaid / zero-due cases.
  const paidPct =
    account && account.totalDue > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((account.totalPaid / account.totalDue) * 100)),
        )
      : 0;
  const RING_C = 2 * Math.PI * 36;

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
          {/* Row 1: greeting (right) + back / logout (left) */}
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
              {/* Bell → the detailed recent-activity feed (Batch 10). Same chip
                  as ParentChildren.tsx's header. This is the ONLY entry point
                  for single-child guardians, who skip the ParentChildren list
                  screen entirely and land straight here. No badge count —
                  that would need an extra fetch this page doesn't make. */}
              <button
                onClick={() => navigate({ to: "/parent-dashboard/activity" })}
                aria-label="النشاط المالي"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                style={{ backgroundColor: "#e8f0fc" }}
              >
                <Bell className="w-4 h-4" style={{ color: "#1b61c9" }} />
              </button>
              {hasMultipleChildren ? (
                <button
                  onClick={() =>
                    navigate({ to: "/parent-dashboard/children" })
                  }
                  className="inline-flex items-center gap-1 rounded-lg h-8 px-2.5 text-[13px] font-medium transition hover:opacity-80"
                  style={{ backgroundColor: "#e8f0fc", color: "#1b61c9" }}
                >
                  <ChevronRight className="w-4 h-4" />
                  رجوع
                </button>
              ) : (
                // Single-child guardian skipped the list screen at login —
                // there is nothing to "go back" to, so logout takes its place.
                <button
                  onClick={handleLogout}
                  aria-label="تسجيل خروج"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                  style={{ backgroundColor: "#e8f0fc" }}
                >
                  <LogOut className="w-4 h-4" style={{ color: "#1b61c9" }} />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: school logo + name, centered (both optional) */}
          {(schoolLogo || schoolName) && (
            <div className="flex flex-col items-center gap-2 mb-3">
              {schoolLogo && (
                <img
                  src={schoolLogo}
                  alt=""
                  className="w-14 h-14 rounded-xl object-contain bg-white border"
                  style={{ borderColor: "#e0e2e6" }}
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

          {/* Row 3: greeting + student name + section label, centered */}
          <h1
            className="text-[22px] font-medium text-center"
            style={{ color: "#181d26" }}
          >
            أهلاً، {firstName(guardianName)}
          </h1>
          {studentName && (
            <p
              className="mt-2 text-[15px] font-bold text-center"
              style={{ color: "#1b61c9" }}
            >
              {studentName}
            </p>
          )}
          <p
            className="text-[13px] text-center mt-1"
            style={{ color: "#6B7280" }}
          >
            الوضع المالي
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-6 space-y-4">
        {!academicPeriodId ? (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
              style={{ backgroundColor: "#F8FAFC" }}
            >
              <Wallet className="w-6 h-6" style={{ color: "#94a3b8" }} />
            </div>
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا توجد فترة أكاديمية حالية
            </p>
          </div>
        ) : !account ? (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
              style={{ backgroundColor: "#F8FAFC" }}
            >
              <Wallet className="w-6 h-6" style={{ color: "#94a3b8" }} />
            </div>
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا يوجد حساب رسوم بعد
            </p>
          </div>
        ) : (
          <>
            {/* Hero — paid-vs-due ring + total due. Direct adaptation of
                PartnerDashboard.tsx's collection-rate ring (lines ~626-689). */}
            <div
              className="rounded-[20px] p-6"
              style={{ backgroundColor: "#e8f0fc" }}
            >
              <div className="flex items-center gap-6">
                <div className="relative w-[92px] h-[92px] flex-shrink-0">
                  <svg
                    width="92"
                    height="92"
                    viewBox="0 0 92 92"
                    className="transform -rotate-90"
                  >
                    <defs>
                      <linearGradient
                        id="parentFinanceRing"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <stop offset="0%" stopColor="#639922" />
                        <stop offset="100%" stopColor="#1b61c9" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="46"
                      cy="46"
                      r="36"
                      fill="none"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="46"
                      cy="46"
                      r="36"
                      fill="none"
                      stroke="url(#parentFinanceRing)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(paidPct / 100) * RING_C} ${RING_C}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-xl font-bold"
                      style={{ color: "#0C447C" }}
                    >
                      {paidPct}%
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-xs mb-1" style={{ color: "#6B7280" }}>
                      إجمالي المستحق
                    </p>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: "#0C447C" }}
                    >
                      {formatCurrency(account.totalDue)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Paid / remaining — MetricCard treatment, semantic tints kept
                (accent for paid, amber for remaining). */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                iconBg="#e8f0fc"
                icon={
                  <Wallet className="w-4 h-4" style={{ color: "#1b61c9" }} />
                }
                label="إجمالي المدفوع"
                value={formatCurrency(account.totalPaid)}
                valueColor="#1b61c9"
              />
              <MetricCard
                iconBg="#FAEEDA"
                icon={
                  <CircleDollarSign
                    className="w-4 h-4"
                    style={{ color: "#BA7517" }}
                  />
                }
                label="المتبقي"
                value={formatCurrency(account.balance)}
                valueColor={account.balance > 0 ? "#BA7517" : "#181d26"}
              />
            </div>

            {account.className && (
              <div
                className="rounded-[14px] border p-3 flex items-center justify-between gap-2"
                style={{ backgroundColor: "#F8FAFC", borderColor: "#e0e2e6" }}
              >
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: "#4B5563" }}
                >
                  الصف
                </span>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: "#181d26" }}
                >
                  {account.className}
                </span>
              </div>
            )}

            {/* Fee items */}
            <div
              className="bg-white rounded-[18px] border p-5"
              style={{ borderColor: "#e0e2e6" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Receipt
                  className="w-4 h-4"
                  strokeWidth={2.2}
                  style={{ color: "#1b61c9" }}
                />
                <h2 className="text-sm font-bold" style={{ color: "#181d26" }}>
                  بنود الرسوم
                </h2>
              </div>
              {feeItems.length === 0 ? (
                <p
                  className="text-sm text-center py-6"
                  style={{ color: "#6B7280" }}
                >
                  لا توجد بنود رسوم
                </p>
              ) : (
                <div className="space-y-2">
                  {feeItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                    >
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "#181d26" }}
                      >
                        {item.itemName ?? item.itemType ?? "—"}
                      </span>
                      <span
                        className="text-sm font-bold flex-shrink-0"
                        style={{ color: item.isDiscount ? "#4F7A1F" : "#181d26" }}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Installments & Payment History Tabs */}
            <div
              className="bg-white rounded-[18px] border p-5"
              style={{ borderColor: "#e0e2e6" }}
            >
              {/* Tabs Switcher */}
              <div
                className="flex items-center p-1 rounded-xl mb-4"
                style={{ backgroundColor: "#F1F5F9" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab("installments")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    activeTab === "installments"
                      ? "bg-white shadow-sm"
                      : "hover:text-[#181d26]"
                  }`}
                  style={{
                    color:
                      activeTab === "installments" ? "#1b61c9" : "#6B7280",
                  }}
                >
                  <Calendar
                    className="w-4 h-4"
                    strokeWidth={2.2}
                    style={{
                      color:
                        activeTab === "installments" ? "#1b61c9" : "#6B7280",
                    }}
                  />
                  <span>الأقساط</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("payments")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    activeTab === "payments"
                      ? "bg-white shadow-sm"
                      : "hover:text-[#181d26]"
                  }`}
                  style={{
                    color: activeTab === "payments" ? "#1b61c9" : "#6B7280",
                  }}
                >
                  <History
                    className="w-4 h-4"
                    strokeWidth={2.2}
                    style={{
                      color:
                        activeTab === "payments" ? "#1b61c9" : "#6B7280",
                    }}
                  />
                  <span>سجل الدفعات</span>
                </button>
              </div>

              {/* Tab Content: Installments */}
              {activeTab === "installments" && (
                installments.length === 0 ? (
                  <p
                    className="text-sm text-center py-6"
                    style={{ color: "#6B7280" }}
                  >
                    لا توجد أقساط مسجلة
                  </p>
                ) : (
                  <div className="space-y-3">
                    {installments.map((inst, index) => {
                      const statusConfig = getInstallmentStatus(inst.status);
                      const instNumber =
                        inst.installmentNo != null ? inst.installmentNo : index + 1;
                      return (
                        <div
                          key={`${inst.installmentNo ?? index}-${index}`}
                          className="rounded-[14px] border p-3.5 space-y-2.5"
                          style={{
                            backgroundColor: "#F8FAFC",
                            borderColor: "#e0e2e6",
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-sm font-bold"
                                style={{ color: "#181d26" }}
                              >
                                رقم القسط: {instNumber}
                              </span>
                              {inst.isCommitted && (
                                <Star size={12} className="text-[#F59E0B]" fill="currentColor" />
                              )}
                            </div>
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                              style={{
                                backgroundColor: statusConfig.bg,
                                color: statusConfig.text,
                                borderColor: statusConfig.border,
                              }}
                            >
                              {statusConfig.label}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[12px]">
                            <span style={{ color: "#6B7280" }}>تاريخ الاستحقاق</span>
                            <span
                              className="font-medium"
                              style={{ color: "#181d26" }}
                            >
                              {formatDate(inst.dueDate)}
                            </span>
                          </div>

                          <div
                            className="grid grid-cols-3 gap-2 pt-2 border-t text-right"
                            style={{ borderColor: "#e0e2e6" }}
                          >
                            <div>
                              <p
                                className="text-[11px] mb-0.5"
                                style={{ color: "#6B7280" }}
                              >
                                المبلغ المستحق
                              </p>
                              <p
                                className="text-[13px] font-bold"
                                style={{ color: "#181d26" }}
                              >
                                {formatCurrency(inst.amountDue)}
                              </p>
                            </div>
                            <div>
                              <p
                                className="text-[11px] mb-0.5"
                                style={{ color: "#6B7280" }}
                              >
                                المدفوع
                              </p>
                              <p
                                className="text-[13px] font-bold"
                                style={{
                                  color:
                                    inst.amountPaid > 0 ? "#4F7A1F" : "#181d26",
                                }}
                              >
                                {formatCurrency(inst.amountPaid)}
                              </p>
                            </div>
                            <div>
                              <p
                                className="text-[11px] mb-0.5"
                                style={{ color: "#6B7280" }}
                              >
                                المتبقي
                              </p>
                              <p
                                className="text-[13px] font-bold"
                                style={{
                                  color:
                                    inst.balance > 0 ? "#BA7517" : "#181d26",
                                }}
                              >
                                {formatCurrency(inst.balance)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* Tab Content: Payment history */}
              {activeTab === "payments" && (
                payments.length === 0 ? (
                  <p
                    className="text-sm text-center py-6"
                    style={{ color: "#6B7280" }}
                  >
                    لا توجد دفعات بعد
                  </p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "#181d26" }}
                          >
                            {formatDate(p.paymentDate)}
                          </p>
                          {p.paymentMethod && (
                            <p
                              className="text-[12px] mt-0.5"
                              style={{ color: "#6B7280" }}
                            >
                              {PAYMENT_METHOD_LABELS[
                                p.paymentMethod.toLowerCase()
                              ] ?? p.paymentMethod}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-sm font-bold flex-shrink-0"
                          style={{ color: "#4F7A1F" }}
                        >
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
