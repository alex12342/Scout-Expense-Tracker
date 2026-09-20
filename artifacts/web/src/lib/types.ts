export type Role = "admin" | "leader";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Scout {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  bsaNumber: string | null;
  rank: string | null;
  age: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  balanceCents?: number;
  duesBreakdown?: {
    assessedCents: number;
    paidCents: number;
    remainingCents: number;
  };
}

export interface Leader {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  position: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  balanceCents?: number;
  duesBreakdown?: {
    assessedCents: number;
    paidCents: number;
    remainingCents: number;
  };
}

export interface BankAccount {
  id: string;
  name: string;
  accountType: "checking" | "savings";
  last4: string | null;
  createdAt: string;
  updatedAt: string;
  balanceCents?: number;
}

export type TxType =
  | "opening_balance"
  | "scout_deposit"
  | "reimbursement"
  | "event_allocation"
  | "event_payment"
  | "event_refund"
  | "event_true_up"
  | "bank_expense"
  | "bank_adjustment"
  | "scout_adjustment";

export type EventStatus = "active" | "finalized";

export type EventParticipantStatus =
  | "registered"
  | "dropped_full_refund"
  | "dropped_fee_assessed"
  | "attended";

export interface Tx {
  id: string;
  occurredAt: string;
  type: TxType;
  amountCents: number;
  scoutId: string | null;
  bankAccountId: string | null;
  eventId: string | null;
  eventParticipantId: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  scoutName?: string | null;
  leaderName?: string | null;
  bankAccountName?: string | null;
}

export interface TroopEvent {
  id: string;
  name: string;
  eventDate: string; // YYYY-MM-DD
  description: string | null;
  totalCostCents: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalAllocatedCents?: number;
  totalPaidCents?: number;
  outstandingCents?: number;
  participantCount?: number;
  isPaid?: boolean;
  status?: EventStatus;
}

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface EventParticipant {
  id: string;
  eventId: string;
  scoutId: string | null;
  leaderId: string | null;
  amountAllocatedCents: number;
  estimatedAllocatedCents: number;
  amountPaidCents: number;
  // Attendance / commitment state (see EventParticipantStatus).
  status?: EventParticipantStatus;
  isManualOverride?: boolean;
  overrideAmountCents?: number | null;
  scoutName?: string | null;
  leaderName?: string | null;
  estimatedOutstandingCents?: number;
  outstandingCents?: number;
  // Payment state (distinct from the attendance `status` above).
  paymentStatus?: "unpaid" | "partial" | "paid";
}

export interface Dashboard {
  accounts: BankAccount[];
  scouts: Scout[];
  leaders: Leader[];
  events: TroopEvent[];
  dues: {
    assessedCents: number;
    paidCents: number;
    outstandingCents: number;
    scoutAssessedCents: number;
    scoutPaidCents: number;
    scoutOutstandingCents: number;
    leaderAssessedCents: number;
    leaderPaidCents: number;
    leaderOutstandingCents: number;
  };
  totals: {
    bankTotalCents: number;
    checkingCents: number;
    savingsCents: number;
    scoutCreditCents: number;
    scoutDebtCents: number;
    leaderCreditCents: number;
    leaderDebtCents: number;
    eventsOutstandingCents: number;
    duesOutstandingCents: number;
    totalOwedToTroopCents: number;
  };
}

export interface EventField {
  key: string;
  value: string;
}

export interface EventLineItem {
  id?: string;
  eventId?: string;
  name: string;
  amountCents: number;
  participantTypes: string[];
  isEstimated?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Report types ──────────────────────────────────────────────────────────

export interface ReportData {
  type: string;
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface TransactionsReport {
  type: "transactions";
  rows: Array<{
    id: string;
    occurredAt: string;
    type: string;
    amountCents: number;
    scoutId: string | null;
    leaderId: string | null;
    bankAccountId: string | null;
    eventId: string | null;
    eventParticipantId: string | null;
    description: string | null;
    scoutName: string | null;
    leaderName: string | null;
    bankAccountName: string | null;
  }>;
  totalRows: number;
}

export interface ScoutSummaryRow {
  scoutId: string;
  name: string;
  firstName: string;
  lastName: string;
  rank: string | null;
  bsaNumber: string | null;
  balanceCents: number;
  totalDepositsCents: number;
  totalEventPaymentsCents: number;
  totalEventAllocationsCents: number;
  isActive: boolean;
}

export interface LeaderSummaryRow {
  leaderId: string;
  name: string;
  firstName: string;
  lastName: string;
  position: string | null;
  balanceCents: number;
  totalDepositsCents: number;
  totalEventPaymentsCents: number;
  totalEventAllocationsCents: number;
  isActive: boolean;
}

export interface EventSummaryRow {
  eventId: string;
  name: string;
  eventDate: string;
  description: string | null;
  totalCostCents: number;
  totalPaidCents: number;
  outstandingCents: number;
  participantCount: number;
}

export interface DuesSummaryRow {
  cycleId: string;
  label: string;
  isCurrent: boolean;
  totalDueCents: number;
  totalPaidCents: number;
  totalWaivedCents?: number;
  outstandingCents: number;
  memberCount: number;
  paidCount: number;
}

export interface TroopEvent {
  id: string;
  name: string;
  eventDate: string; // YYYY-MM-DD
  description: string | null;
  totalCostCents: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalAllocatedCents?: number;
  totalPaidCents?: number;
  outstandingCents?: number;
  participantCount?: number;
  isPaid?: boolean;
  status?: EventStatus;
  fields: EventField[];
}

export type DuesMemberType = "scout" | "leader";

export interface DuesCycle {
  id: string;
  label: string;
  scoutAmountCents: number;
  leaderAmountCents: number;
  isCurrent: boolean;
  bankAccountId: string | null;
  createdAt: string;
}

export interface DuesEntry {
  id: string;
  cycleId: string;
  memberType: "scout" | "leader";
  memberId: string | null;
  amountCents: number;
  isPaid: boolean;
  isWaived: boolean;
  paidAt: string | null;
  dueDate: string | null;
  memberName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  status?: "unpaid" | "partial" | "paid" | "overdue" | "waived";
  amountPaidCents?: number;
  remainingCents?: number;
}
