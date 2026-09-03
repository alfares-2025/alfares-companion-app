import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCurrentUser, type AuthUser, ApiError } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser(u);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiError) {
          navigate({ to: "/login" });
        }
      });
  }, [navigate]);

  if (loading || !user) {
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
      className="min-h-screen flex items-center justify-center bg-slate-100 px-4"
    >
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 px-10 py-12 text-center max-w-md w-full">
        <h1 className="text-3xl font-bold text-slate-800">
          مرحباً، {user.name}
        </h1>
        <p className="text-slate-500 mt-3 text-sm">
          تم تسجيل الدخول بنجاح
        </p>
      </div>
    </div>
  );
}
