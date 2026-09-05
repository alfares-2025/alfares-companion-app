import { useState, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getStudentFinance,
  getParentChildren,
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
  Receipt,
  History,
} from "lucide-react";

// Local copies of PartnerDashboard.tsx's formatting helpers — that file
// doesn't export them, and this file must not be modified, so they're
// adapted here rather than imported.
function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("en-US")} شيكل (₪)`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  check: "شيك",
  cheque: "شيك",
  transfer: "تحويل",
  card: "بطاقة",
};

/**
 * Parent Portal — one student's read-only finance summary
 * (GET /api/parent-portal/students/:studentId/finance, Batch 3).
 *
 * Visual reference: PartnerDashboard.tsx's MetricCard/stat-row/grouped-card
 * patterns and semantic color tokens, adapted (not imported — that file is
 * untouched and doesn't export them).
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      navigate({ to: "/parent-dashboard/children" });
      return;
    }

    let cancelled = false;

    // Fetched together: the finance data itself, plus the guardian's full
    // child list purely to decide whether "back" (>1 child) or "تسجيل خروج"
    // (exactly 1 child, meaning this guardian skipped the list screen
    // entirely at login) belongs in the header.
    Promise.all([getStudentFinance(studentId), getParentChildren()])
      .then(([financeData, children]) => {
        if (cancelled) return;
        setFinance(financeData);
        setHasMultipleChildren(children.length > 1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
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
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, navigate]);

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
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#A32D2D" }} />
          <p className="text-sm font-medium" style={{ color: "#A32D2D" }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!finance) return null;

  const { account, feeItems, payments, academicPeriodId } = finance;

  return (
    <div dir="rtl" className="min-h-screen" style={{ backgroundColor: "#F8FAFC" }}>
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {hasMultipleChildren ? (
            <button
              onClick={() => navigate({ to: "/parent-dashboard/children" })}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
              style={{ color: "#6B7280" }}
            >
              <ChevronRight className="w-4 h-4" />
              الأبناء
            </button>
          ) : (
            // Single-child guardian skipped the list screen at login — there
            // is nothing to "go back" to, so logout takes its place here.
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
              style={{ color: "#6B7280" }}
            >
              <LogOut className="w-4 h-4" />
              تسجيل خروج
            </button>
          )}
          <h1 className="text-[16px] font-bold" style={{ color: "#181d26" }}>
            الوضع المالي
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-6 space-y-4">
        {!academicPeriodId ? (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: "#e0e2e6" }} />
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا توجد فترة أكاديمية حالية
            </p>
          </div>
        ) : !account ? (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: "#e0e2e6" }} />
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا يوجد حساب رسوم بعد
            </p>
          </div>
        ) : (
          <>
            {/* Stat cards — collected (accent) / remaining (amber), same
                tint language as PartnerDashboard.tsx's totals row. */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[14px] border p-3 flex flex-col gap-1"
                style={{ backgroundColor: "#e8f0fc", borderColor: "#c5d8f0" }}
              >
                <span className="text-[11px] font-medium" style={{ color: "#4B5563" }}>
                  إجمالي المدفوع
                </span>
                <p className="text-[16px] font-bold leading-tight" style={{ color: "#1b61c9" }}>
                  {formatCurrency(account.totalPaid)}
                </p>
              </div>
              <div
                className="rounded-[14px] border p-3 flex flex-col gap-1"
                style={{ backgroundColor: "#FAEEDA", borderColor: "#EAD8B0" }}
              >
                <span className="text-[11px] font-medium" style={{ color: "#4B5563" }}>
                  المتبقي
                </span>
                <p
                  className="text-[16px] font-bold leading-tight"
                  style={{ color: account.balance > 0 ? "#BA7517" : "#181d26" }}
                >
                  {formatCurrency(account.balance)}
                </p>
              </div>
            </div>

            <div
              className="rounded-[14px] border p-3 flex items-center justify-between gap-2"
              style={{ backgroundColor: "#F8FAFC", borderColor: "#e0e2e6" }}
            >
              <span className="text-[12px] font-semibold" style={{ color: "#4B5563" }}>
                إجمالي المستحق
              </span>
              <span className="text-[14px] font-bold" style={{ color: "#181d26" }}>
                {formatCurrency(account.totalDue)}
              </span>
            </div>

            {account.className && (
              <div
                className="rounded-[14px] border p-3 flex items-center justify-between gap-2"
                style={{ backgroundColor: "#F8FAFC", borderColor: "#e0e2e6" }}
              >
                <span className="text-[12px] font-semibold" style={{ color: "#4B5563" }}>
                  الصف
                </span>
                <span className="text-[14px] font-bold" style={{ color: "#181d26" }}>
                  {account.className}
                </span>
              </div>
            )}

            {/* Fee items */}
            <div className="bg-white rounded-[18px] border p-5" style={{ borderColor: "#e0e2e6" }}>
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4" strokeWidth={2.2} style={{ color: "#1b61c9" }} />
                <h2 className="text-sm font-bold" style={{ color: "#181d26" }}>
                  بنود الرسوم
                </h2>
              </div>
              {feeItems.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "#6B7280" }}>
                  لا توجد بنود رسوم
                </p>
              ) : (
                <div className="space-y-2">
                  {feeItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                    >
                      <span className="text-sm font-medium truncate" style={{ color: "#181d26" }}>
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

            {/* Payment history */}
            <div className="bg-white rounded-[18px] border p-5" style={{ borderColor: "#e0e2e6" }}>
              <div className="flex items-center gap-2 mb-4">
                <History className="w-4 h-4" strokeWidth={2.2} style={{ color: "#1b61c9" }} />
                <h2 className="text-sm font-bold" style={{ color: "#181d26" }}>
                  سجل الدفعات
                </h2>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "#6B7280" }}>
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
                        <p className="text-sm font-semibold" style={{ color: "#181d26" }}>
                          {formatDate(p.paymentDate)}
                        </p>
                        {p.paymentMethod && (
                          <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                            {PAYMENT_METHOD_LABELS[p.paymentMethod.toLowerCase()] ??
                              p.paymentMethod}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: "#4F7A1F" }}>
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
