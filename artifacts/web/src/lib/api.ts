import type {
  User,
  Scout,
  Leader,
  BankAccount,
  Tx,
  TroopEvent,
  EventParticipant,
  Dashboard,
  DuesCycle,
  DuesEntry,
  EventField,
  ReportData,
  TransactionsReport,
  ScoutSummaryRow,
  LeaderSummaryRow,
  EventSummaryRow,
  DuesSummaryRow,
} from "./types";

const TOKEN_KEY = "set.token";
const USER_KEY = "set.user";

export class ApiError extends Error {
  status: number;
  issues?: unknown;
  constructor(status: number, message: string, issues?: unknown) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* private mode — session won't persist; app still works in-memory */
  }
  window.dispatchEvent(new Event("set:auth-changed"));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("set:auth-changed"));
}

export function hasSession(): boolean {
  return getToken() !== null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { redirectOn401?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && opts?.redirectOn401 !== false) {
    // Session expired or invalid — send the user back to login (unless the
    // failing call was the login itself).
    if (!path.startsWith("/auth/login")) {
      clearSession();
      window.location.assign("/login");
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, (data as { issues?: unknown })?.issues);
  }
  return data as T;
}

export const api = {
  // auth
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("POST", "/auth/login", {
      username,
      password,
    }, { redirectOn401: false }),
  me: () => request<User>("GET", "/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request("POST", "/auth/change-password", { currentPassword, newPassword }),
  listUsers: () => request<User[]>("GET", "/auth/users"),
  createUser: (body: {
    username: string;
    displayName: string;
    password: string;
    role: "admin" | "leader";
  }) => request<User>("POST", "/auth/users", body),
  updateUser: (id: string, body: Partial<{
    displayName: string;
    role: "admin" | "leader";
    isActive: boolean;
    password: string;
  }>) => request<User>("PATCH", `/auth/users/${id}`, body),
  deleteUser: (id: string) => request("DELETE", `/auth/users/${id}`),

  // scouts
  listScouts: () => request<Scout[]>("GET", "/scouts"),
  createScout: (body: {
    firstName: string;
    lastName: string;
    bsaNumber?: string;
    rank?: string;
    age?: number | null;
    isActive?: boolean;
  }) => request<Scout>("POST", "/scouts", body),
  getScout: (id: string) => request<Scout>("GET", `/scouts/${id}`),
  updateScout: (id: string, body: Partial<{
    firstName: string;
    lastName: string;
    bsaNumber: string;
    rank: string;
    age: number | null;
    isActive: boolean;
  }>) => request<Scout>("PATCH", `/scouts/${id}`, body),
  deleteScout: (id: string) => request("DELETE", `/scouts/${id}`),
  scoutLedger: (id: string) =>
    request<{ balanceCents: number; entries: Tx[] }>("GET", `/scouts/${id}/ledger`),

  // leaders
  listLeaders: () => request<Leader[]>("GET", "/leaders"),
  createLeader: (body: {
    firstName: string;
    lastName: string;
    position?: string;
    isActive?: boolean;
  }) => request<Leader>("POST", "/leaders", body),
  getLeader: (id: string) => request<Leader>("GET", `/leaders/${id}`),
  updateLeader: (id: string, body: Partial<{
    firstName: string;
    lastName: string;
    position: string;
    isActive: boolean;
  }>) => request<Leader>("PATCH", `/leaders/${id}`, body),
  deleteLeader: (id: string) => request("DELETE", `/leaders/${id}`),
  leaderLedger: (id: string) =>
    request<{ balanceCents: number; entries: Tx[] }>("GET", `/leaders/${id}/ledger`),

  // bank accounts
  listAccounts: () => request<BankAccount[]>("GET", "/bank-accounts"),
  createAccount: (body: {
    name: string;
    accountType: "checking" | "savings";
    last4?: string;
    openingBalance?: string | number;
  }) => request<BankAccount>("POST", "/bank-accounts", body),
  getAccount: (id: string) => request<BankAccount>("GET", `/bank-accounts/${id}`),
  updateAccount: (id: string, body: Partial<{
    name: string;
    accountType: "checking" | "savings";
    last4: string;
  }>) => request<BankAccount>("PATCH", `/bank-accounts/${id}`, body),
  deleteAccount: (id: string) => request("DELETE", `/bank-accounts/${id}`),
  accountTransactions: (id: string) =>
    request<{ balanceCents: number; entries: Tx[] }>(
      "GET",
      `/bank-accounts/${id}/transactions`,
    ),

  // ledger
  listLedger: (params?: {
    scoutId?: string;
    leaderId?: string;
    bankAccountId?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.scoutId) qs.set("scoutId", params.scoutId);
    if (params?.leaderId) qs.set("leaderId", params.leaderId);
    if (params?.bankAccountId) qs.set("bankAccountId", params.bankAccountId);
    if (params?.type) qs.set("type", params.type);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request<Tx[]>("GET", `/ledger${s ? `?${s}` : ""}`);
  },
  createTransaction: (body: {
    type: string;
    amount: string | number;
    scoutId?: string;
    leaderId?: string;
    bankAccountId?: string;
    description?: string;
    occurredAt?: string;
  }) => request<Tx>("POST", "/ledger", body),
  deleteTransaction: (id: string) => request("DELETE", `/ledger/${id}`),

  // events
  listEvents: () => request<TroopEvent[]>("GET", "/events"),
  createEvent: (body: {
    name: string;
    eventDate: string;
    description?: string;
    lineItems: Array<{ name: string; amountCents: number; participantTypes?: string[] }>;
    participants: { scoutId?: string; leaderId?: string; amountAllocatedCents?: number }[];
  }) => request("POST", "/events", body),
  updateEventCosts: (id: string, body: { lineItems: Array<{ name: string; amountCents: number; participantTypes?: string[] }> }) =>
    request("PATCH", `/events/${id}/update-costs`, body),
  getEvent: (id: string) =>
    request<TroopEvent & { participants: EventParticipant[]; payments: Tx[] }>(
      "GET",
      `/events/${id}`,
    ),
  updateEvent: (id: string, body: Partial<{
    name: string;
    eventDate: string;
    description: string | null;
    fields: EventField[];
  }>) => request("PATCH", `/events/${id}`, body),
  deleteEvent: (id: string) => request("DELETE", `/events/${id}`),
  recordPayment: (
    id: string,
    body: {
      scoutId?: string;
      leaderId?: string;
      amount: string | number;
      bankAccountId?: string;
      description?: string;
    },
  ) => request("POST", `/events/${id}/payments`, body),
  recordRefund: (
    id: string,
    body: {
      scoutId?: string;
      leaderId?: string;
      amount: string | number;
      bankAccountId?: string;
      description?: string;
    },
  ) => request("POST", `/events/${id}/refunds`, body),

  // dashboard
  dashboard: () => request<Dashboard>("GET", "/dashboard"),

  // dues
  listDuesCycles: () => request<DuesCycle[]>("GET", "/dues/cycles"),
  createDuesCycle: (body: {
    label: string;
    scoutAmountCents?: number;
    leaderAmountCents?: number;
    bankAccountId?: string | null;
  }) => request<DuesCycle>("POST", "/dues/cycles", body),
  updateDuesCycle: (
    id: string,
    body: Partial<{
      label: string;
      isCurrent: boolean;
      scoutAmountCents: number;
      leaderAmountCents: number;
      bankAccountId: string | null;
    }>,
  ) => request<DuesCycle>("PATCH", `/dues/cycles/${id}`, body),
  deleteDuesCycle: (id: string) => request("DELETE", `/dues/cycles/${id}`),
  listDuesEntries: (cycleId: string) =>
    request<DuesEntry[]>("GET", `/dues/cycles/${cycleId}/dues`),
  createDuesEntry: (cycleId: string, body: {
    memberType: "scout" | "leader";
    memberId?: string;
    amountCents: number;
    dueDate?: string;
    notes?: string;
  }) => request<DuesEntry>("POST", `/dues/cycles/${cycleId}/dues`, body),
  updateDuesEntry: (id: string, body: Partial<{
    amountCents: number;
    dueDate: string;
    isPaid: boolean;
    isWaived: boolean;
    notes: string;
  }>) => request<DuesEntry>("PATCH", `/dues/${id}`, body),
  toggleDuesEntry: (id: string) => request<DuesEntry>("PATCH", `/dues/${id}/toggle`),
  waiveDuesEntry: (id: string, waived: boolean, note?: string) =>
    request<DuesEntry>("PATCH", `/dues/${id}/waive`, { waived, note }),
  bulkToggle: (ids: string[]) =>
    request<DuesEntry[]>("POST", "/dues/bulk-toggle", { ids }),
  bulkMarkPaid: (ids: string[]) =>
    request<DuesEntry[]>("POST", "/dues/bulk-mark-paid", { ids }),
  generateDues: (cycleId: string) =>
    request<DuesEntry[]>("POST", `/dues/cycles/${cycleId}/generate`),
  addMembersToCycle: (cycleId: string, members: { memberType: "scout" | "leader"; memberId: string }[]) =>
    request<{ added: number }>("POST", `/dues/cycles/${cycleId}/add-members`, { members }),
  getDuesHistory: (duesId: string) =>
    request<Array<{ id: string; action: string; note: string; transactionId: string | null; createdAt: string }>>("GET", `/dues/${duesId}/history`),
  getDuesSummary: (cycleId?: string) => {
    const qs = cycleId ? `cycleId=${cycleId}` : "";
    return request<{ summary: any; breakdowns: DuesEntry[]; totalRows: number }>("GET", `/dues/reports/summary${qs ? `?${qs}` : ""}`);
  },
  recordDuesPayment: (duesId: string, amountCents: number, bankAccountId: string) =>
    request<DuesEntry>("POST", `/dues/${duesId}/record-payment`, { amountCents, bankAccountId }),
  applyDeposit: (memberType: "scout" | "leader", memberId: string, amountCents: number, bankAccountId: string) =>
    request<{ applied: { duesId: string; amountCents: number }[]; remaining: number; totalApplied: number }>(
      "POST", "/dues/apply-deposit", { memberType, memberId, amountCents, bankAccountId },
    ),

  // import
  importScouts: (csv: string) =>
    request<{ results: Array<{ row: number; firstName: string; lastName: string; ok: boolean; error?: string }> }>(
      "POST", "/import/scouts", { csv },
    ),
  importLeaders: (csv: string) =>
    request<{ results: Array<{ row: number; firstName: string; lastName: string; ok: boolean; error?: string }> }>(
      "POST", "/import/leaders", { csv },
    ),

  // reports
  getReport: <T = ReportData>(params: { type: string; [key: string]: string | undefined }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, v);
    }
    const s = qs.toString();
    return s ? request<T>("GET", `/reports?${s}`) : request<T>("GET", "/reports");
  },
};
