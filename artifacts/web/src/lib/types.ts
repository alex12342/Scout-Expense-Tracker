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
  bsaNumber: string | null;
  rank: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  balanceCents?: number;
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
  | "bank_expense"
  | "bank_adjustment"
  | "scout_adjustment";

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
}

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface EventParticipant {
  id: string;
  eventId: string;
  scoutId: string;
  amountAllocatedCents: number;
  amountPaidCents: number;
  createdAt: string;
  scoutName?: string | null;
  outstandingCents?: number;
  status?: PaymentStatus;
}

export interface Dashboard {
  accounts: BankAccount[];
  scouts: Scout[];
  events: TroopEvent[];
  totals: {
    bankTotalCents: number;
    checkingCents: number;
    savingsCents: number;
    scoutCreditCents: number;
    scoutDebtCents: number;
    eventsOutstandingCents: number;
  };
}
