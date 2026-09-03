import { useNavigate } from "@tanstack/react-router";
import { useNotifications } from "@/contexts/NotificationsContext";
import { ChevronLeft, Trash2, Bell } from "lucide-react";

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, markAsRead, deleteNotification, markAllAsRead } = useNotifications();

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-[#e0e2e6] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/partner-dashboard" })}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#181d26] transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" style={{ color: "#1b61c9" }} />
            <h1 className="text-lg font-bold text-[#181d26]">التنبيهات</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e0e2e6] p-8 text-center">
            <Bell className="w-12 h-12 text-[#6B7280] mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">لا توجد تنبيهات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => markAsRead(notification.id)}
                className={`bg-white rounded-2xl border border-[#e0e2e6] p-4 transition hover:shadow-md cursor-pointer ${
                  !notification.read ? "bg-[#e8f0fc]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#1b61c9" }} />
                      )}
                      <h3 className="text-sm font-bold text-[#181d26]">
                        {notification.title}
                      </h3>
                    </div>
                    <p className="text-xs text-[#6B7280] mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      {formatTime(notification.timestamp)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    className="text-[#6B7280] hover:text-[#EF4444] transition flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}