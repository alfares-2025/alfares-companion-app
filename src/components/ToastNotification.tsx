import { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";

interface ToastProps {
  title: string;
  message: string;
  duration?: number;
  onDismiss: () => void;
}

export function ToastNotification({ title, message, duration = 4000, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Slide in animation
    const timer = setTimeout(() => setIsVisible(true), 100);

    // Auto dismiss
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for slide out animation
    }, duration);

    return () => {
      clearTimeout(timer);
      clearTimeout(dismissTimer);
    };
  }, [duration, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <div
        className="bg-white rounded-2xl border border-[#e0e2e6] shadow-lg p-4 w-80"
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: "#e8f0fc" }}
          >
            <Bell className="w-5 h-5" style={{ color: "#1b61c9" }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#181d26] mb-1">{title}</h3>
            <p className="text-xs text-[#6B7280] leading-relaxed">{message}</p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="text-[#6B7280] hover:text-[#181d26] transition flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}