import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/lib/router";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ToastContainer } from "@/components/ToastContainer";

function App() {
  return (
    <NotificationsProvider>
      <RouterProvider router={router} />
      <ToastContainer />
    </NotificationsProvider>
  );
}

export default App;
