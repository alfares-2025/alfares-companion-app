import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getStudentFinance,
  getParentChildren,
  getSchoolLogo,
  ApiError,
  type ParentStudentFinance as ParentStudentFinanceData,
} from "@/lib/api";
import {
  Loader2,
  AlertCircle,
  ChevronRight,
  Wallet,
  Banknote,
  FileCheck2,
  CreditCard,
  Landmark,
  Bell,
  Star,
  Check,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { formatCurrency, formatDate } from "@/lib/format";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  check: "شيك",
  cheque: "شيك",
  transfer: "تحويل",
  card: "بطاقة",
};

const PAYMENT_METHOD_ICONS = {
  cash: Banknote,
  check: FileCheck2,
  cheque: FileCheck2,
  transfer: Landmark,
  card: CreditCard,
} as const;

const INSTALLMENT_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  paid: { label: "مدفوع", bg: "var(--ok-soft)", text: "var(--ok)" },
  partial: { label: "جزئي", bg: "var(--warn-soft)", text: "var(--warn)" },
  overdue: { label: "متأخر", bg: "var(--bad-soft)", text: "var(--bad)" },
  unpaid: { label: "غير مدفوع", bg: "var(--paper)", text: "var(--ink-3)" },
};

function getInstallmentStatus(status: string | null | undefined): {
  label: string;
  bg: string;
  text: string;
} {
  const normalized = (status ?? "").toLowerCase().trim();
  return (
    INSTALLMENT_STATUS_CONFIG[normalized] ?? {
      label: status || "غير مدفوع",
      bg: "var(--paper)",
      text: "var(--ink-3)",
    }
  );
}

const SALE_KINDS: Array<[string, string]> = [
  ["uniform", "الزي"],
  ["book", "الكتب"],
  ["scout", "الكشافة"],
];

type TabKey = "summary" | "installments" | "payments";

/** One line of the statement: label on the right, amount on the left. */
function StatementRow({
  label,
  value,
  color = "var(--ink)",
  strong = false,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span
        className="text-[14px]"
        style={{ color: strong ? "var(--ink)" : "var(--ink-2)", fontWeight: strong ? 700 : 400 }}
      >
        {label}
      </span>
      <span
        className={strong ? "text-[16px] font-extrabold" : "text-[14px] font-semibold"}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Parent Portal — one student's read-only finance summary
 * (GET /api/parent-portal/students/:studentId/finance). Behaviour (routing,
 * fetching, 401/403 handling, pull-to-refresh) is unchanged.
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
  const [studentName, setStudentName] = useState<string | null>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [barReady, setBarReady] = useState(false);

  // Shared in-flight guard so pull-to-refresh never fires overlapping fetches.
  const isFetchingRef = useRef(false);

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
        // list (for this student's own name and the school name); and the
        // school logo (best-effort — its own heavier endpoint, must never
        // break the page).
        const [financeData, childrenData, logo] = await Promise.all([
          getStudentFinance(studentId),
          getParentChildren(),
          getSchoolLogo().catch(() => ({ schoolLogo: null as string | null })),
        ]);

        setFinance(financeData);
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

  // The progress bar grows once from empty after the data first arrives.
  useEffect(() => {
    if (!finance) return;
    const id = requestAnimationFrame(() => setBarReady(true));
    return () => cancelAnimationFrame(id);
  }, [finance]);

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

  // ---- Loading ----
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

  // ---- Error ----
  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "var(--paper)" }}
      >
        <div className="bg-white rounded-lg px-6 py-8 text-center max-w-sm w-full">
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
    summary,
    cashSales = [],
  } = finance;

  const dueSales = cashSales.filter((r) => r.countsAsDue);
  const replacementTotal = cashSales
    .filter((r) => !r.countsAsDue)
    .reduce((a, r) => a + r.totalPrice, 0);
  const discountsTotal = summary ? summary.discountTotal + summary.exemptionTotal : 0;
  const netFees = summary ? summary.totalCharges - summary.cashSalesDue : 0;

  const paidRatio =
    account && account.totalDue > 0
      ? Math.min(1, Math.max(0, account.totalPaid / account.totalDue))
      : 0;
  const settled = !!account && account.balance <= 0;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "summary", label: "ملخص الحساب" },
    { key: "installments", label: "الأقساط" },
    { key: "payments", label: "سجل الدفعات" },
  ];

  const emptyState = (text: string) => (
    <div className="bg-white rounded-lg px-6 py-10 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3"
        style={{ backgroundColor: "var(--paper)" }}
      >
        <Wallet className="w-6 h-6" style={{ color: "var(--ink-3)" }} />
      </div>
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>
        {text}
      </p>
    </div>
  );

  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{ backgroundColor: "var(--paper)" }}
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

      <header className="hero-surface px-4 pt-5 pb-7">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate({ to: "/parent-dashboard/children" })}
              className="chip-glass inline-flex items-center gap-1 rounded-md h-9 pr-2 pl-3.5 text-[14px] font-medium"
            >
              <ChevronRight className="w-[18px] h-[18px]" />
              رجوع
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              {schoolLogo && (
                <img
                  src={schoolLogo}
                  alt=""
                  className="w-8 h-8 rounded-md object-contain bg-white p-0.5 flex-shrink-0"
                />
              )}
              <button
                onClick={() => navigate({ to: "/parent-dashboard/activity" })}
                aria-label="النشاط المالي"
                className="chip-glass inline-flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0"
              >
                <Bell className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          <div className="rise" style={{ ["--i" as string]: 0 }}>
            {studentName && (
              <h1 className="text-[22px] font-extrabold leading-tight">
                {studentName}
              </h1>
            )}
            {account?.className && (
              <span className="inline-block mt-2 rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold text-[color:var(--hero-ink)]">
                {account.className}
              </span>
            )}
          </div>

          {account && (
            <div className="rise mt-6" style={{ ["--i" as string]: 1 }}>
              <p className="text-[13px] text-[color:var(--hero-ink-2)]">
                {account.balance < 0
                  ? "رصيد دائن"
                  : settled
                    ? "لا يوجد مبلغ متبقٍّ"
                    : "المتبقي على الحساب"}
              </p>
              <p className="mt-0.5 text-[44px] font-extrabold leading-none tracking-tight">
                {formatCurrency(Math.abs(account.balance))}
              </p>
              <div className="mt-4 h-2 rounded-full bg-[color:var(--hero-track)] overflow-hidden">
                <div
                  className="bar-fill h-full rounded-full bg-[color:var(--brand)]"
                  style={{ width: barReady ? `${Math.round(paidRatio * 100)}%` : "0%" }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-[color:var(--hero-ink-2)]">
                <span>إجمالي المدفوع {formatCurrency(account.totalPaid)}</span>
                <span>إجمالي المستحق {formatCurrency(account.totalDue)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {account && academicPeriodId && (
        <nav
          className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur-sm"
          style={{ borderColor: "var(--line)" }}
          aria-label="أقسام الحساب"
        >
          <div className="max-w-2xl mx-auto px-4 flex">
            {tabs.map((t) => {
              const on = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  aria-current={on ? "page" : undefined}
                  className="relative flex-1 py-3.5 text-[14px] transition-colors"
                  style={{
                    color: on ? "var(--brand)" : "var(--ink-3)",
                    fontWeight: 500,
                  }}
                >
                  {t.label}
                  <span
                    className="absolute bottom-0 inset-x-6 h-[3px] rounded-t-full transition-opacity"
                    style={{ backgroundColor: "var(--brand)", opacity: on ? 1 : 0 }}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-10 space-y-4">
        {!academicPeriodId ? (
          emptyState("لا توجد فترة أكاديمية حالية")
        ) : !account ? (
          emptyState("لا يوجد حساب رسوم بعد")
        ) : (
          <>
            {/* ───────── Account summary ───────── */}
            {activeTab === "summary" && (
              <div key="summary" className="space-y-4">
                {summary ? (
                  <div className="rise bg-white rounded-lg px-5 divide-y" style={{ borderColor: "var(--line)", ["--i" as string]: 0 }}>
                    <StatementRow label="إجمالي الرسوم الحالية" value={formatCurrency(netFees + discountsTotal)} />
                    {discountsTotal > 0 && (
                      <StatementRow
                        label="إجمالي الخصومات والإعفاءات"
                        value={`- ${formatCurrency(discountsTotal)}`}
                        color="var(--ok)"
                      />
                    )}
                    <StatementRow label="صافي الرسوم الحالية" value={formatCurrency(netFees)} />
                    {summary.previousBalance > 0 && (
                      <StatementRow label="أرصدة سابقة" value={formatCurrency(summary.previousBalance)} />
                    )}
                  </div>
                ) : null}

                {summary && dueSales.length > 0 && (
                  <section className="rise bg-white rounded-lg px-5 pt-4 pb-2" style={{ ["--i" as string]: 1 }}>
                    <h2 className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                      المشتريات من مبيعات الطلاب
                    </h2>
                    <div className="mt-1 divide-y" style={{ borderColor: "var(--line)" }}>
                      {SALE_KINDS.map(([type, label]) => {
                        const rows = dueSales.filter((r) => r.productType === type);
                        if (rows.length === 0) return null;
                        const sum = rows.reduce((a, r) => a + r.totalPrice, 0);
                        return (
                          <div key={type} className="py-3">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                                {label}
                              </span>
                              <span className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                                {formatCurrency(sum)}
                              </span>
                            </div>
                            {rows.map((r) => (
                              <p
                                key={r.id}
                                className="mt-1 text-[12px] truncate"
                                style={{ color: "var(--ink-3)" }}
                              >
                                {r.itemName ?? "—"}
                                {r.quantity > 1 ? ` × ${r.quantity}` : ""} · {formatDate(r.createdAt)}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    {replacementTotal > 0 && (
                      <p className="pb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        بدل فاقد / تالف: {formatCurrency(replacementTotal)} (غير محسوب في المستحق)
                      </p>
                    )}
                  </section>
                )}

                <div className="rise bg-white rounded-lg px-5 divide-y" style={{ borderColor: "var(--line)", ["--i" as string]: 2 }}>
                  <StatementRow label="إجمالي المستحق" value={formatCurrency(account.totalDue)} strong />
                  {summary && summary.cashPaid > 0 && (
                    <StatementRow label="المدفوع نقداً" value={formatCurrency(summary.cashPaid)} color="var(--brand)" />
                  )}
                  {summary && summary.checkPaid > 0 && (
                    <StatementRow label="المدفوع بشيكات" value={formatCurrency(summary.checkPaid)} color="var(--brand)" />
                  )}
                  {summary && summary.creditsApplied > 0 && (
                    <StatementRow label="رسوم حجز المقعد" value={formatCurrency(summary.creditsApplied)} color="var(--brand)" />
                  )}
                  <StatementRow
                    label={account.balance < 0 ? "رصيد دائن" : "الرصيد المتبقي"}
                    value={formatCurrency(Math.abs(account.balance))}
                    color={account.balance < 0 ? "var(--brand)" : settled ? "var(--ok)" : "var(--warn)"}
                    strong
                  />
                </div>

                <section className="rise bg-white rounded-lg px-5 pt-4 pb-2" style={{ ["--i" as string]: 3 }}>
                  <h2 className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                    بنود الرسوم
                  </h2>
                  {feeItems.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: "var(--ink-3)" }}>
                      لا توجد بنود رسوم
                    </p>
                  ) : (
                    <div className="mt-1 divide-y" style={{ borderColor: "var(--line)" }}>
                      {feeItems.map((item) => (
                        <div key={item.id} className="flex items-baseline justify-between gap-3 py-3">
                          <span className="text-[14px] truncate" style={{ color: "var(--ink-2)" }}>
                            {item.itemName ?? item.itemType ?? "—"}
                          </span>
                          <span
                            className="text-[14px] font-semibold flex-shrink-0"
                            style={{ color: item.isDiscount ? "var(--ok)" : "var(--ink)" }}
                          >
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ───────── Installments ───────── */}
            {activeTab === "installments" && (
              <div key="installments">
                {installments.length === 0 ? (
                  emptyState("لا توجد أقساط مسجلة")
                ) : (
                  <ol className="space-y-3">
                    {installments.map((inst, index) => {
                      const st = getInstallmentStatus(inst.status);
                      const num = inst.installmentNo != null ? inst.installmentNo : index + 1;
                      const pct =
                        inst.amountDue > 0
                          ? Math.min(100, Math.round((inst.amountPaid / inst.amountDue) * 100))
                          : 0;
                      const isPaid = (inst.status ?? "").toLowerCase() === "paid";
                      return (
                        <li
                          key={`${inst.installmentNo ?? index}-${index}`}
                          className="rise bg-white rounded-lg p-4"
                          style={{ ["--i" as string]: index }}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 text-[14px] font-bold"
                              style={{ backgroundColor: st.bg, color: st.text }}
                            >
                              {isPaid ? <Check className="w-4 h-4" strokeWidth={3} /> : num}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                                رقم القسط: {num}
                                {inst.isCommitted && (
                                  <Star size={12} className="text-[#F59E0B]" fill="currentColor" />
                                )}
                              </p>
                              <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                                تاريخ الاستحقاق: {formatDate(inst.dueDate)}
                              </p>
                            </div>
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
                              style={{ backgroundColor: st.bg, color: st.text }}
                            >
                              {st.label}
                            </span>
                          </div>

                          <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: isPaid ? "var(--ok)" : "var(--brand)" }}
                            />
                          </div>

                          <div className="mt-2.5 grid grid-cols-3 text-right">
                            <div>
                              <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>المبلغ المستحق</p>
                              <p className="text-[14px] font-bold mt-0.5" style={{ color: "var(--ink)" }}>
                                {formatCurrency(inst.amountDue)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>المدفوع</p>
                              <p
                                className="text-[14px] font-bold mt-0.5"
                                style={{ color: inst.amountPaid > 0 ? "var(--ok)" : "var(--ink)" }}
                              >
                                {formatCurrency(inst.amountPaid)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>المتبقي</p>
                              <p
                                className="text-[14px] font-bold mt-0.5"
                                style={{ color: inst.balance > 0 ? "var(--warn)" : "var(--ink)" }}
                              >
                                {formatCurrency(inst.balance)}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {/* ───────── Payment history ───────── */}
            {activeTab === "payments" && (
              <div key="payments">
                {payments.length === 0 ? (
                  emptyState("لا توجد دفعات بعد")
                ) : (
                  <ul className="bg-white rounded-lg px-4 divide-y" style={{ borderColor: "var(--line)" }}>
                    {payments.map((p, index) => {
                      const method = p.paymentMethod?.toLowerCase() ?? "";
                      const Icon =
                        PAYMENT_METHOD_ICONS[method as keyof typeof PAYMENT_METHOD_ICONS] ?? Banknote;
                      return (
                        <li
                          key={p.id}
                          className="rise flex items-center gap-3 py-3.5"
                          style={{ ["--i" as string]: Math.min(index, 8) }}
                        >
                          <span
                            className="inline-flex items-center justify-center w-10 h-10 rounded-md flex-shrink-0"
                            style={{ backgroundColor: "var(--brand-soft)", color: "var(--brand)" }}
                          >
                            <Icon className="w-[18px] h-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                              {formatDate(p.paymentDate)}
                            </p>
                            {p.paymentMethod && (
                              <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                                {PAYMENT_METHOD_LABELS[method] ?? p.paymentMethod}
                              </p>
                            )}
                          </div>
                          <span className="text-[14px] font-bold flex-shrink-0" style={{ color: "var(--ok)" }}>
                            {formatCurrency(p.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
