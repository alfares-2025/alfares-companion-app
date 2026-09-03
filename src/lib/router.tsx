import {
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Students from "@/pages/Students";
import PartnerDashboard from "@/pages/PartnerDashboard";
import Notifications from "@/pages/Notifications";

// ---------------------------------------------------------------------------
// Root route
// ---------------------------------------------------------------------------

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// ---------------------------------------------------------------------------
// Index → redirect to /login
// ---------------------------------------------------------------------------

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

// ---------------------------------------------------------------------------
// Home — verifies session via getCurrentUser() on mount
// ---------------------------------------------------------------------------

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/home",
  component: Home,
});

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/students",
  component: Students,
});

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

const partnerDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partner-dashboard",
  component: PartnerDashboard,
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partner-dashboard/notifications",
  component: Notifications,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  homeRoute,
  studentsRoute,
  partnerDashboardRoute,
  notificationsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createMemoryHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
