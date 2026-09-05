import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { login, getCurrentUser, parentLogin, ApiError } from "@/lib/api";
import { Loader2, LogIn } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Parent-mode toggle — entirely separate state/fields/handler from the
  // staff email/password flow above. Default (isParentMode === false)
  // renders exactly the original form below, unchanged.
  const [isParentMode, setIsParentMode] = useState(false);
  const [guardianNationalId, setGuardianNationalId] = useState("");
  const [accessCode, setAccessCode] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      const user = await getCurrentUser();
      navigate({ to: user.role.toUpperCase() === "PARTNER" ? "/partner-dashboard" : "/students" });
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

  async function handleParentSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { students } = await parentLogin(guardianNationalId, accessCode);
      if (students.length === 1) {
        navigate({
          to: "/parent-dashboard/children/$studentId/finance",
          params: { studentId: students[0].id },
        });
      } else {
        navigate({ to: "/parent-dashboard/children" });
      }
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
              {isParentMode
                ? "مرحباً بك، يرجى إدخال بيانات ولي الأمر"
                : "مرحباً بك، يرجى إدخال بياناتك"}
            </p>
          </div>

          {/* Mode toggle — staff (default) vs ولي أمر. Purely additive: does
              not touch email/password state, handleSubmit, or the form
              below in any way. */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setIsParentMode(false);
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                !isParentMode
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              موظف
            </button>
            <button
              type="button"
              onClick={() => {
                setIsParentMode(true);
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                isParentMode
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              ولي أمر
            </button>
          </div>

          {/* Staff form — default, unchanged */}
          {!isParentMode && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  اسم المستخدم
                </label>
                <input
                  id="email"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  placeholder="أدخل اسم المستخدم"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  كلمة المرور
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  placeholder="أدخل كلمة المرور"
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
          )}

          {/* Parent form — national ID + access code, submits to
              POST /api/parent-portal/login (no schoolId — resolved
              server-side from which code matches, per Batch 2). */}
          {isParentMode && (
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

              <div>
                <label
                  htmlFor="accessCode"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  كود الوصول
                </label>
                <input
                  id="accessCode"
                  type="text"
                  autoComplete="off"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white text-center tracking-widest font-mono"
                  placeholder="ABCD1234"
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
          )}

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
