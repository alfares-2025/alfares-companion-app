import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { parentLogin, getParentChildren, ApiError } from "@/lib/api";
import { Loader2, LogIn } from "lucide-react";

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
        className="min-h-screen flex items-center justify-center bg-slate-100"
      >
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8"
    >
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg px-8 py-10 border border-slate-200/60">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600 mb-4">
              <LogIn className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">
              تسجيل الدخول
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              مرحباً بك، يرجى إدخال رقم هوية ولي الأمر
            </p>
          </div>

          {/* Parent form — national ID only (temporary), submits to
              POST /api/parent-portal/login with no code; the backend
              accepts that only while PARENT_LOGIN_ID_ONLY=true. */}
          <form onSubmit={handleParentSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="guardianNationalId"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
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
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  placeholder="أدخل رقم الهوية"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-white font-semibold transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "تسجيل الدخول"
                )}
              </button>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600 font-medium text-center">
                {error}
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          نظام الفارس — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
