export const API_BASE_URL = "https://private.alfares.cloud";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = "حدث خطأ غير متوقع";
    try {
      const body = await res.json();
      message = body?.message ?? body?.error ?? message;
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {
        /* keep default */
      }
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  user?: AuthUser;
  message?: string;
}

// ---------------------------------------------------------------------------
// Auth API functions
// ---------------------------------------------------------------------------

export async function login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
  const isEmail = usernameOrEmail.includes("@");
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(
      isEmail
        ? { email: usernameOrEmail, password }
        : { name: usernameOrEmail, password }
    ),
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/api/auth/me", {
    method: "GET",
  });
  return response.user;
}

/**
 * No backend logout endpoint exists yet.
 * For now this is a placeholder — the session lives entirely in the
 * backend's HTTP-only cookie, so there's no local token to clear.
 */
export async function logout(): Promise<void> {
  // TODO: call /api/auth/logout once the backend exposes it
}

// ---------------------------------------------------------------------------
// Student types
// ---------------------------------------------------------------------------

export interface StudentFees {
  total: number;
  paid: number;
}

export interface Student {
  id: number | string;
  name: string;
  grade: string;
  section: string;
  fees: StudentFees;
}

// ---------------------------------------------------------------------------
// Students API functions
// ---------------------------------------------------------------------------

export async function getStudents(): Promise<Student[]> {
  const res = await request<{ students: Student[] }>("/api/students", {
    method: "GET",
  });
  return res.students;
}

// ---------------------------------------------------------------------------
// Finance types
// ---------------------------------------------------------------------------

export interface FinanceTotals {
  total_due: number;
  total_paid: number;
  total_remaining: number;
  collection_rate: number;
}

export interface FinanceStudents {
  with_fee_account: number;
  overdue_count: number;
}

export interface FinanceAccountStatus {
  paid_full: number;
  partial: number;
  due: number;
  overdue: number;
}

export interface MonthlyCollection {
  month_label: string;
  amount: number;
}

export interface FinanceInstallments {
  total_value: number;
  paid: number;
  partial: number;
  due: number;
  overdue: number;
}

export interface FinanceChecks {
  received: number;
  deposited: number;
  collected: number;
  returned: number;
  pending_amount: number;
  received_amount: number;
  deposited_amount: number;
  collected_amount: number;
  returned_amount: number;
}

export interface FinancePreviousDues {
  total: number;
  included_in_fees: number;
  independent: number;
  paid: number;
  remaining: number;
  students_count: number;
}

export interface FinanceStatistics {
  totals: FinanceTotals;
  students: FinanceStudents;
  account_status: FinanceAccountStatus;
  monthly_collections: MonthlyCollection[];
  installments: FinanceInstallments;
  checks: FinanceChecks;
  previous_dues: FinancePreviousDues;
}

export interface TopDebtor {
  id: number | string;
  name: string;
  class: string;
  remaining: number;
}

export interface RecentTransaction {
  id: number | string;
  student_name: string;
  amount: number;
  payment_method: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Finance API functions
// ---------------------------------------------------------------------------

export async function getFinanceStatistics(): Promise<FinanceStatistics> {
  return request<FinanceStatistics>("/api/finance/statistics", {
    method: "GET",
  });
}

export async function getTopDebtors(limit = 10): Promise<TopDebtor[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<TopDebtor[]>(`/api/finance/statistics/top-debtors?${params}`, {
    method: "GET",
  });
}

export async function getRecentTransactions(limit = 10): Promise<RecentTransaction[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<RecentTransaction[]>(
    `/api/finance/statistics/recent-transactions?${params}`,
    { method: "GET" },
  );
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface MessageConversationParticipant {
  id: string;
  name: string;
  avatar: string | null;
  role: string | null;
}

export interface MessageConversationLastMessage {
  id: string;
  body: string;
  senderId: string;
  createdAt: string | null;
}

export interface Conversation {
  id: string;
  otherParticipant: MessageConversationParticipant | null;
  lastMessage: MessageConversationLastMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  otherParticipantLastReadMessageId: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DirectoryUser {
  id: string;
  name: string;
  avatar: string | null;
  role: string | null;
}

// POST /api/messages/conversations returns the find-or-create result itself
// ({ id, created }), NOT a full Conversation — messageService.js's
// findOrCreateDirectConversation only ever resolves { id: string, created:
// boolean } (see messageController.js#createConversation, which does
// `res.json(result)` with no extra envelope key). Confirmed against the
// actual backend source, not assumed from the field name.
export interface CreateConversationResult {
  id: string;
  created: boolean;
}

// ---------------------------------------------------------------------------
// Message API functions
// ---------------------------------------------------------------------------

export async function getConversations(): Promise<Conversation[]> {
  const res = await request<{ conversations: Conversation[] }>(
    "/api/messages/conversations",
    { method: "GET" },
  );
  return res.conversations;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await request<{ messages: Message[] }>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "GET" },
  );
  return res.messages;
}

export async function getUnreadCount(): Promise<number> {
  const res = await request<{ unreadCount: number }>(
    "/api/messages/unread-count",
    { method: "GET" },
  );
  return res.unreadCount;
}

export async function getMessageDirectory(): Promise<DirectoryUser[]> {
  const res = await request<{ directory: DirectoryUser[] }>(
    "/api/messages/directory",
    { method: "GET" },
  );
  return res.directory;
}

export async function createConversation(
  recipientUserId: string,
): Promise<CreateConversationResult> {
  return request<CreateConversationResult>("/api/messages/conversations", {
    method: "POST",
    body: JSON.stringify({ recipientUserId }),
  });
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<Message> {
  const res = await request<{ message: Message }>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
  return res.message;
}

// ---------------------------------------------------------------------------
// Parent Portal types
// ---------------------------------------------------------------------------

export interface ParentChild {
  id: string;
  name: string;
  grade: string | null;
}

// POST /api/parent-portal/login and GET /api/parent-portal/students both
// return the guardian's children plus the personalized-header fields:
// `guardianName` (always a value — the backend falls back to the national id),
// `schoolName` (nullable — a soft-deleted / missing school). The school LOGO
// is deliberately NOT here (see getSchoolLogo).
export interface ParentLoginResponse {
  students: ParentChild[];
  guardianName: string;
  schoolName: string | null;
}

export interface ParentChildrenResponse {
  students: ParentChild[];
  guardianName: string;
  schoolName: string | null;
}

// GET /api/parent-portal/school-logo — its own endpoint because
// schools.logo_inline is a base64 data URI that can run to a couple of MB.
// `schoolLogo` is a ready-to-use <img src>: a `data:` URI in the common case,
// otherwise an absolute URL (getSchoolLogo resolves server-relative paths).
export interface SchoolLogoResponse {
  schoolLogo: string | null;
}

// GET /api/parent-portal/finance-summary — aggregate totals across every one
// of the guardian's children (backs the summary card above the children
// list). `studentCount` is the guardian's total child count.
export interface ParentFinanceSummary {
  totalDue: number;
  totalPaid: number;
  balance: number;
  studentCount: number;
}

// GET /api/parent-portal/payment-notifications/unread-count — count of new
// payment events across ALL of the guardian's children since they last opened
// the list. Cursor + count model (mirrors the messaging unread badge), NOT an
// individual-notifications feed. A family payment split across siblings counts
// as one event.
export interface PaymentNotificationCount {
  unreadCount: number;
}

export interface ParentFinanceAccount {
  id: string;
  className: string | null;
  tuitionTotal: number;
  discountAmount: number;
  otherFeesTotal: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate: string | null;
  status: string | null;
}

export interface ParentFeeItem {
  id: string;
  itemType: string | null;
  itemName: string | null;
  amount: number;
  isDiscount: boolean;
  status: string | null;
}

export interface ParentPayment {
  id: string;
  amount: number;
  paymentDate: string | null;
  paymentMethod: string | null;
  paymentCategory: string | null;
  status: string | null;
}

// Matches services/parentPortalService.js#getStudentFinanceSummary's return
// shape exactly (Batch 3, backend/controllers/parentPortalController.js#
// getStudentFinance does `res.json(finance)` with no extra envelope).
// `account: null` is the graceful empty state for "no current academic
// period" (academicPeriodId also null then) or "no fee account opened yet"
// (academicPeriodId still set) — never an error response.
export interface ParentStudentFinance {
  academicPeriodId: string | number | null;
  account: ParentFinanceAccount | null;
  feeItems: ParentFeeItem[];
  payments: ParentPayment[];
}

// ---------------------------------------------------------------------------
// Parent Portal API functions
// ---------------------------------------------------------------------------

// Body field name is `guardianNationalId`, matching
// parentPortalController.js#parentLogin exactly — no `schoolId` is ever
// sent (the backend resolves the school from which access code matches).
export async function parentLogin(
  guardianNationalId: string,
  code: string,
): Promise<ParentLoginResponse> {
  return request<ParentLoginResponse>("/api/parent-portal/login", {
    method: "POST",
    body: JSON.stringify({ guardianNationalId, code }),
  });
}

export async function getParentChildren(): Promise<ParentChildrenResponse> {
  return request<ParentChildrenResponse>("/api/parent-portal/students", {
    method: "GET",
  });
}

// The backend returns either a `data:` URI (schools.logo_inline, the common
// case) or a server-relative `/api/logo/...` path; normalize the latter to an
// absolute URL so a plain <img src> renders from the companion app's origin.
// Returns { schoolLogo: null } gracefully for a school with no logo.
export async function getSchoolLogo(): Promise<SchoolLogoResponse> {
  const res = await request<SchoolLogoResponse>(
    "/api/parent-portal/school-logo",
    { method: "GET" },
  );
  const raw = res.schoolLogo;
  if (!raw) return { schoolLogo: null };
  const schoolLogo =
    raw.startsWith("data:") || raw.startsWith("http")
      ? raw
      : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
  return { schoolLogo };
}

export async function getFinanceSummary(): Promise<ParentFinanceSummary> {
  return request<ParentFinanceSummary>(
    "/api/parent-portal/finance-summary",
    { method: "GET" },
  );
}

export async function getPaymentNotificationCount(): Promise<PaymentNotificationCount> {
  return request<PaymentNotificationCount>(
    "/api/parent-portal/payment-notifications/unread-count",
    { method: "GET" },
  );
}

// "Opening the children list = read" — advances the guardian's server-side
// cursor to the newest payment so the badge clears next time. Best-effort;
// callers fire it without blocking the UI, and the count shown this render is
// intentionally the pre-mark value.
export async function markPaymentsSeen(): Promise<void> {
  await request<{ ok: boolean }>(
    "/api/parent-portal/payment-notifications/mark-seen",
    { method: "POST" },
  );
}

export async function getStudentFinance(
  studentId: string,
): Promise<ParentStudentFinance> {
  return request<ParentStudentFinance>(
    `/api/parent-portal/students/${encodeURIComponent(studentId)}/finance`,
    { method: "GET" },
  );
}

// Unlike the staff logout() above, this one is real — the backend endpoint
// exists (Batch 2) and this actually clears req.session.parent server-side.
export async function parentLogout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/parent-portal/logout", {
    method: "POST",
  });
}

// markConversationRead/deleteMessage both resolve `{ ok: true }` as-is (see
// messageController.js#markConversationAsRead / #deleteConversationMessage —
// `res.json(result)` where `result` is markConversationRead/deleteMessage's
// own `{ ok: true }` return value, no further envelope). Confirmed against
// the actual backend source, not assumed.
export async function markConversationRead(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: "POST" },
  );
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );
}

// Per-participant soft-hide — see messageService.js#deleteConversationForCaller
// on the backend: removes the conversation from the caller's own list only,
// the other participant's view is unaffected. Route is conversation-level
// (no messageId segment), unlike deleteMessage above. Resolves { ok: true }
// as-is (messageController.js#deleteConversation does `res.json(result)`
// with no further envelope), matching deleteMessage/markConversationRead's
// own return-shape convention rather than discarding it as void.
export async function deleteConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
}
