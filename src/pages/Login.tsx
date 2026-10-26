import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { parentLogin, getParentChildren, ApiError } from "@/lib/api";
import { Loader2, GraduationCap, ArrowLeft } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if an existing persistent parent session is already active
  useEffect(() => {
    let cancelled = false;
    getParentChildren()
      .then(() => {
        if (cancelled) return;
        // Every guardian — single- or multi-child — lands on the children
        // list first; there is no direct-to-finance shortcut anymore.
        navigate({ to: "/parent-dashboard/children" });
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const [guardianNationalId, setGuardianNationalId] = useState("");

  async function handleParentSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await parentLogin(guardianNationalId);
      // Every guardian lands on the children list first, regardless of how
      // many children they have — no direct-to-finance shortcut.
      navigate({ to: "/parent-dashboard/children" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
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

  return (
    <div dir="rtl" className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--paper)" }}>
      {/* Brand band */}
      <div className="hero-surface px-6 pt-14 pb-24 text-white">
        <div className="max-w-sm mx-auto rise" style={{ ["--i" as string]: 0 }}>
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 mb-5">
            <GraduationCap className="w-6 h-6" strokeWidth={2} />
          </span>
          <h1 className="text-[28px] font-extrabold leading-tight">بوابة أولياء الأمور</h1>
          <p className="mt-2 text-[15px] text-white/80">
            تابع الوضع المالي لأبنائك أولاً بأول.
          </p>
        </div>
      </div>

      {/* Form sheet overlapping the band */}
      <main className="flex-1 px-4 -mt-14">
        <div
          className="max-w-sm mx-auto rounded-3xl bg-white px-6 py-7 rise"
          style={{
            ["--i" as string]: 2,
            boxShadow: "0 12px 32px -12px rgba(14, 60, 133, 0.28)",
          }}
        >
          <h2 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
            تسجيل الدخول
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--ink-2)" }}>
            مرحباً بك، يرجى إدخال رقم هوية ولي الأمر
          </p>

          <form onSubmit={handleParentSubmit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="guardianNationalId"
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--ink)" }}
              >
                رقم الهوية
              </label>
              <input
                id="guardianNationalId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={guardianNationalId}
                onChange={(e) => setGuardianNationalId(e.target.value)}
                required
                className="w-full h-12 rounded-xl border px-4 text-base outline-none transition focus:ring-4"
                style={{
                  borderColor: "var(--line)",
                  backgroundColor: "var(--paper)",
                  color: "var(--ink)",
                  letterSpacing: "0.04em",
                }}
                placeholder="أدخل رقم الهوية"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl text-white text-base font-bold transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--brand)" }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  تسجيل الدخول
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl px-4 py-3 text-sm font-medium text-center"
              style={{ backgroundColor: "var(--bad-soft)", color: "var(--bad)" }}
            >
              {error}
            </div>
          )}
        </div>
      </main>

      <p className="text-center text-xs py-6" style={{ color: "var(--ink-3)" }}>
        نظام الفارس — جميع الحقوق محفوظة
      </p>
    </div>
  );
}
