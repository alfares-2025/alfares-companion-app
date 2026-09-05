import { useState, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  getParentChildren,
  parentLogout,
  ApiError,
  type ParentChild,
} from "@/lib/api";
import { Loader2, AlertCircle, Users, LogOut, ChevronLeft, X } from "lucide-react";

/**
 * Parent Portal — children list (multi-child guardians land here after
 * login; single-child guardians skip straight to the finance detail).
 * Real design tokens throughout (new work, not an edit to legacy Login.tsx)
 * — matches PartnerDashboard.tsx/Notifications.tsx's token convention.
 */
export default function ParentChildren() {
  const navigate = useNavigate();
  // Untyped/loose read — no validateSearch is registered on this route, so
  // this stays a plain optional flash message rather than a new app-wide
  // search-param convention. Set by ParentStudentFinance.tsx when a 403
  // redirects a guardian back here.
  const search = useSearch({ strict: false }) as { error?: string };

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(
    search?.error ?? null,
  );

  useEffect(() => {
    getParentChildren()
      .then((data) => {
        setChildren(data);
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

  async function handleLogout() {
    try {
      await parentLogout();
    } catch {
      // Ignore — still navigate to /login below regardless, matching this
      // app's existing "logout always lands you on /login" convention.
    } finally {
      navigate({ to: "/login" });
    }
  }

  return (
    <div dir="rtl" className="min-h-screen" style={{ backgroundColor: "#F8FAFC" }}>
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-[20px] font-bold" style={{ color: "#181d26" }}>
            أبنائي
          </h1>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
            style={{ color: "#6B7280" }}
          >
            <LogOut className="w-4 h-4" />
            تسجيل خروج
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-6 space-y-3">
        {flashMessage && (
          <div
            className="rounded-[14px] border p-3 flex items-start justify-between gap-3"
            style={{ backgroundColor: "#FCEBEB", borderColor: "#F0CFCF" }}
          >
            <p className="text-sm font-medium" style={{ color: "#A32D2D" }}>
              {flashMessage}
            </p>
            <button
              onClick={() => setFlashMessage(null)}
              className="flex-shrink-0 transition hover:opacity-70"
              style={{ color: "#A32D2D" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1b61c9" }} />
          </div>
        )}

        {!loading && error && (
          <div
            className="bg-white rounded-[18px] border px-6 py-8 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#A32D2D" }} />
            <p className="text-sm font-medium" style={{ color: "#A32D2D" }}>
              {error}
            </p>
          </div>
        )}

        {!loading && !error && children.length === 0 && (
          <div
            className="bg-white rounded-[18px] border px-6 py-10 text-center"
            style={{ borderColor: "#e0e2e6" }}
          >
            <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "#e0e2e6" }} />
            <p className="text-sm" style={{ color: "#6B7280" }}>
              لا يوجد أبناء مسجّلون
            </p>
          </div>
        )}

        {!loading && !error && children.length > 0 && (
          <div className="space-y-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() =>
                  navigate({
                    to: "/parent-dashboard/children/$studentId/finance",
                    params: { studentId: child.id },
                  })
                }
                className="w-full bg-white rounded-[14px] border p-4 flex items-center justify-between gap-3 text-right transition hover:shadow-md"
                style={{ borderColor: "#e0e2e6" }}
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "#181d26" }}>
                    {child.name}
                  </p>
                  {child.grade && (
                    <p className="text-[13px] mt-0.5" style={{ color: "#6B7280" }}>
                      {child.grade}
                    </p>
                  )}
                </div>
                <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: "#6B7280" }} />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
