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
import Messages from "@/pages/Messages";
import ParentChildren from "@/pages/ParentChildren";
import ParentStudentFinance from "@/pages/ParentStudentFinance";
import ParentActivity from "@/pages/ParentActivity";

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

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partner-dashboard/messages",
  component: Messages,
});

// ---------------------------------------------------------------------------
// Parent Portal — children list + one child's finance detail. Each page
// resolves its own auth/data via req.session.parent-backed endpoints and
// handles its own 401 redirect on mount, same convention as every route
// above (no route-level guard).
// ---------------------------------------------------------------------------

const parentChildrenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parent-dashboard/children",
  component: ParentChildren,
});

const parentStudentFinanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parent-dashboard/children/$studentId/finance",
  component: ParentStudentFinance,
});

// Batch 10 — the detailed recent-activity feed across all the guardian's
// children. Reached from the bell in ParentChildren's header. Resolves its
// own auth/data on mount and handles its own 401 redirect, same convention
// as every route above (no route-level guard).
const parentActivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parent-dashboard/activity",
  component: ParentActivity,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  homeRoute,
  studentsRoute,
  partnerDashboardRoute,
  notificationsRoute,
  messagesRoute,
  parentChildrenRoute,
  parentStudentFinanceRoute,
  parentActivityRoute,
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
