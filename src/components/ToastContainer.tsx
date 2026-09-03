import { useNotifications } from "@/contexts/NotificationsContext";
import { ToastNotification } from "./ToastNotification";
import { useState } from "react";

export function ToastContainer() {
  const { notifications } = useNotifications();
  const [toastQueue, setToastQueue] = useState<string[]>([]);

  // DISABLED: Stop automatic toast generation
  // Toasts are now only shown when manually triggered via the notifications system

  const handleDismiss = (id: string) => {
    setToastQueue(prev => prev.filter(q => q !== id));
  };

  return (
    <>
      {toastQueue.map(id => {
        const notification = notifications.find(n => n.id === id);
        if (!notification) return null;
        
        return (
          <ToastNotification
            key={id}
            title={notification.title}
            message={notification.message}
            onDismiss={() => handleDismiss(id)}
          />
        );
      })}
    </>
  );
}