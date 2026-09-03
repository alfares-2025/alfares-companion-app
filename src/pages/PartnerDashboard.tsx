import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getFinanceStatistics,
  getTopDebtors,
  getRecentTransactions,
  ApiError,
  type FinanceStatistics,
  type TopDebtor,
  type RecentTransaction,
} from "@/lib/api";
import {
  Loader2,
  AlertCircle,
  LogOut,
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  FileX,
  Wallet,
  CheckCircle2,
  CircleDollarSign,
  AlertTriangle,
  Receipt,
  ChevronLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  return (value ?? 0).toLocaleString("ar-EG");
}

function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("ar-EG")} د.إ`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
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

function methodPill(method: string): { label: string; className: string } {
  const key = method.toLowerCase();
  return {
    label: PAYMENT_METHOD_LABELS[key] ?? method,
    className: PAYMENT_METHOD_STYLES[key] ?? "bg-slate-100 text-slate-600",
  };
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
  const [stats, setStats] = useState<FinanceStatistics | null>(null);
  const [debtors, setDebtors] = useState<TopDebtor[]>([]);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getFinanceStatistics(),
      getTopDebtors(10),
      getRecentTransactions(10),
    ])
      .then(([s, d, t]) => {
        setStats(s);
        setDebtors(d);
        setTransactions(t);
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
    { label: "مدفوع كامل", count: account_status.paid_full, color: "#059669" },
    { label: "جزئي", count: account_status.partial, color: "#1b61c9" },
    { label: "مستحق", count: account_status.due, color: "#d97706" },
    { label: "متأخر", count: account_status.overdue, color: "#e11d48" },
  ];
  const statusTotal =
    account_status.paid_full +
    account_status.partial +
    account_status.due +
    account_status.overdue;

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-[#e0e2e6] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl"
              style={{ backgroundColor: "#e8f0fc" }}
            >
              <BarChart3
                className="w-5 h-5"
                strokeWidth={2.2}
                style={{ color: "#1b61c9" }}
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#181d26] leading-tight">
                الملخص المالي
              </h1>
              <p className="text-xs text-[#6B7280]">لوحة تحكم الشريك</p>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/login" })}
            className="inline-flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#181d26] transition"
          >
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* ============================================================
            2. Hero card — collection rate
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-[#e0e2e6] p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp
              className="w-4 h-4"
              style={{ color: "#1b61c9" }}
              strokeWidth={2.2}
            />
            <span className="text-sm font-medium text-[#6B7280]">
              نسبة التحصيل
            </span>
          </div>
          <p
            className="text-5xl font-bold leading-none mb-5"
            style={{ color: "#1b61c9" }}
          >
            {totals.collection_rate}%
          </p>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(totals.collection_rate, 100)}%`,
                backgroundColor: "#1b61c9",
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[#6B7280] mb-1">إجمالي المستحق</p>
              <p className="text-base font-bold text-[#181d26]">
                {formatCurrency(totals.total_due)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#6B7280] mb-1">إجمالي المحصّل</p>
              <p className="text-base font-bold text-emerald-600">
                {formatCurrency(totals.total_paid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#6B7280] mb-1">المتبقي</p>
              <p className="text-base font-bold text-amber-600">
                {formatCurrency(totals.total_remaining)}
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================
            3. 2x2 secondary metric grid
        ============================================================ */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={
              <AlertTriangle
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: students.overdue_count > 0 ? "#d97706" : "#6B7280" }}
              />
            }
            iconBg={students.overdue_count > 0 ? "#fffbeb" : "#f1f5f9"}
            iconColor="#d97706"
            label="عدد الطلاب المتأخرين"
            value={formatNumber(students.overdue_count)}
            valueClassName={students.overdue_count > 0 ? "#d97706" : "#181d26"}
          />
          <MetricCard
            icon={
              <Clock className="w-4 h-4" strokeWidth={2.2} style={{ color: "#1b61c9" }} />
            }
            iconBg="#e8f0fc"
            iconColor="#1b61c9"
            label="الذمم السابقة المتبقية"
            value={formatCurrency(previous_dues.remaining)}
            subValue={`${previous_dues.students_count} طالب`}
          />
          <MetricCard
            icon={
              <Wallet className="w-4 h-4" strokeWidth={2.2} style={{ color: "#1b61c9" }} />
            }
            iconBg="#e8f0fc"
            iconColor="#1b61c9"
            label="شيكات قيد التحصيل"
            value={formatCurrency(checks.pending_amount)}
          />
          <MetricCard
            icon={
              <FileX
                className="w-4 h-4"
                strokeWidth={2.2}
                style={{ color: checks.returned > 0 ? "#e11d48" : "#6B7280" }}
              />
            }
            iconBg={checks.returned > 0 ? "#fff1f2" : "#f1f5f9"}
            iconColor="#e11d48"
            label="شيكات مرجوعة"
            value={formatNumber(checks.returned)}
            subValue={
              checks.returned > 0
                ? formatCurrency(checks.returned_amount)
                : undefined
            }
            valueClassName={checks.returned > 0 ? "#e11d48" : "#181d26"}
          />
        </div>

        {/* ============================================================
            4. Account status — horizontal bar + counts
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-[#e0e2e6] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users
              className="w-4 h-4"
              strokeWidth={2.2}
              style={{ color: "#1b61c9" }}
            />
            <h2 className="text-sm font-bold text-[#181d26]">حالة الحسابات</h2>
          </div>

          {/* Bar */}
          {statusTotal > 0 && (
            <div className="flex h-3 rounded-full overflow-hidden mb-4">
              {statusSegments.map(
                (seg) =>
                  seg.count > 0 && (
                    <div
                      key={seg.label}
                      className="transition-all duration-500"
                      style={{
                        width: `${(seg.count / statusTotal) * 100}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                  ),
              )}
            </div>
          )}

          {/* Counts */}
          <div className="grid grid-cols-4 gap-2">
            {statusSegments.map((seg) => (
              <div key={seg.label} className="text-center">
                <div
                  className="w-2.5 h-2.5 rounded-full mx-auto mb-1.5"
                  style={{ backgroundColor: seg.color }}
                />
                <p className="text-lg font-bold text-[#181d26]">
                  {formatNumber(seg.count)}
                </p>
                <p className="text-[11px] text-[#6B7280] leading-tight mt-0.5">
                  {seg.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ============================================================
            5. Recent transactions
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-[#e0e2e6] p-5">
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
            <div className="space-y-2 max-h-80 overflow-y-auto">
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
        <div className="bg-white rounded-2xl border border-[#e0e2e6] p-5">
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
                      {(idx + 1).toLocaleString("ar-EG")}
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

        {/* Footer note */}
        <div className="flex items-center justify-center gap-1.5 pt-2 pb-4">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#6B7280]" />
          <p className="text-xs text-[#6B7280]">عرض للقراءة فقط — تحديث يومي</p>
        </div>
      </main>
    </div>
  );
}
