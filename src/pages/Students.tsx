import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getStudents, ApiError, type Student } from "@/lib/api";
import { Loader2, Search, Users, AlertCircle, LogOut } from "lucide-react";

export default function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getStudents()
      .then((data) => {
        setStudents(data);
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

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return students;
    return students.filter((s) => s.name.includes(q));
  }, [students, search]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
              <Users className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-lg font-bold text-slate-800">قائمة الطلاب</h1>
          </div>
          <button
            onClick={() => navigate({ to: "/login" })}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الطالب..."
            className="w-full rounded-xl border border-slate-300 bg-white pr-11 pl-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              {search.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد طلاب"}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((student) => {
              const fullyPaid = student.fees.paid >= student.fees.total;
              return (
                <div
                  key={student.id}
                  className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-4 flex items-center justify-between transition hover:shadow-md hover:border-slate-300"
                >
                  {/* Name + grade */}
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-800 truncate">
                      {student.name}
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {student.grade} - {student.section}
                    </p>
                  </div>

                  {/* Fee indicator */}
                  <div className="flex-shrink-0 text-left mr-3">
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        fullyPaid
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          fullyPaid ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      {student.fees.paid} / {student.fees.total}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
