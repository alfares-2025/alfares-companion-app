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
