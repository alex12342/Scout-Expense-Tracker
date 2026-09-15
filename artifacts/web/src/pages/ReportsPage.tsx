import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Tx } from "../lib/types";
import { formatMoney, formatDateTime, parseMoney } from "../lib/money";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogFooter,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  useToast,
} from "../components/ui";

const REPORT_TYPES = [
  { value: "transactions", label: "Transaction Ledger" },
  { value: "scout-summary", label: "Scout Summary" },
  { value: "leader-summary", label: "Leader Summary" },
  { value: "event-summary", label: "Event Summary" },
  { value: "dues-summary", label: "Dues Summary" },
];

const TRANSACTION_TYPES = [
  { value: "", label: "All types" },
  { value: "opening_balance", label: "Opening Balance" },
  { value: "scout_deposit", label: "Deposit", },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "event_allocation", label: "Event Allocation" },
  { value: "event_payment", label: "Event Payment" },
  { value: "event_refund", label: "Event Refund" },
  { value: "bank_expense", label: "Bank Expense" },
  { value: "bank_adjustment", label: "Bank Adjustment" },
  { value: "scout_adjustment", label: "Scout Adjustment" },
  { value: "dues_payment", label: "Dues Payment" },
  { value: "dues_refund", label: "Dues Refund" },
];

const TYPE_DISPLAY: Record<string, string> = {
  scout_deposit: "Deposit",
  opening_balance: "Opening Balance",
  event_allocation: "Event Allocation",
  event_payment: "Event Payment",
  event_refund: "Event Refund",
  bank_expense: "Bank Expense",
  bank_adjustment: "Bank Adjustment",
  scout_adjustment: "Scout Adjustment",
  dues_payment: "Dues Payment",
  dues_refund: "Dues Refund",
  reimbursement: "Reimbursement",
};

function displayName(type: string): string {
  return TYPE_DISPLAY[type] ?? type.replace(/_/g, " ");
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState("transactions");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [scoutId, setScoutId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [txType, setTxType] = useState("");
  const [isActive, setIsActive] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDate, setEditDate] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: scouts } = useQuery({
    queryKey: ["scouts"],
    queryFn: () => api.listScouts(),
  });

  const { data: leaders } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => api.listLeaders(),
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const { data: cycles } = useQuery({
    queryKey: ["dues-cycles"],
    queryFn: () => api.listDuesCycles(),
  });

  const reportParams = {
    type: reportType,
    from: fromDate || undefined,
    to: toDate || undefined,
    scoutId: scoutId || undefined,
    leaderId: leaderId || undefined,
    bankAccountId: bankAccountId || undefined,
    transactionType: txType || undefined,
    isActive: isActive || undefined,
    cycleId: cycleId || undefined,
  };

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportParams],
    queryFn: () => api.getReport(reportParams),
    enabled: reportType !== "",
  });

  const updateTxMut = useMutation({
    mutationFn: (data: { id: string; amount: string; description: string; occurredAt: string }) =>
      api.updateTransaction(data.id, {
        amount: data.amount,
        description: data.description || undefined,
        occurredAt: data.occurredAt,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
      setEditingTx(null);
      toast("Transaction updated", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteTxMut = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
      setDeleteConfirm(null);
      toast("Transaction deleted", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const openEditTx = (tx: Tx) => {
    setEditingTx(tx);
    setEditAmount((tx.amountCents / 100).toFixed(2));
    setEditDesc(tx.description ?? "");
    setEditDate(new Date(tx.occurredAt).toISOString().split("T")[0]);
  };

  const exportCSV = () => {
    if (!report || !report.rows || report.rows.length === 0) return;
    const keys = Object.keys(report.rows[0]);
    const header = keys.join(",");
    const rows = report.rows.map((r) =>
      keys
        .map((k) => {
          const val = r[k];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(","),
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFilters = () => {
    switch (reportType) {
      case "transactions":
        return (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Select
              value={scoutId}
              onChange={(e) => setScoutId(e.target.value)}
              placeholder="All scouts"
              options={(scouts ?? []).map((s) => ({
                value: s.id,
                label: `${s.firstName} ${s.lastName}`,
              }))}
            />
            <Select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              placeholder="All leaders"
              options={(leaders ?? []).map((l) => ({
                value: l.id,
                label: `${l.firstName} ${l.lastName}`,
              }))}
            />
            <Select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              placeholder="All accounts"
              options={(accounts ?? []).map((a) => ({
                value: a.id,
                label: a.name,
              }))}
            />
            <Select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              placeholder="All types"
              options={TRANSACTION_TYPES}
            />
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
            />
          </div>
        );
      case "scout-summary":
        return (
          <Select
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            placeholder="All scouts"
            options={[
              { value: "", label: "All scouts" },
              { value: "true", label: "Active only" },
              { value: "false", label: "Inactive only" },
            ]}
          />
        );
      case "leader-summary":
        return (
          <Select
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            placeholder="All leaders"
            options={[
              { value: "", label: "All leaders" },
              { value: "true", label: "Active only" },
              { value: "false", label: "Inactive only" },
            ]}
          />
        );
      case "event-summary":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
            />
          </div>
        );
      case "dues-summary":
        return (
          <Select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            placeholder="All cycles"
            options={[
              { value: "", label: "All cycles" },
              ...(cycles ?? []).map((c) => ({
                value: c.id,
                label: `${c.label}${c.isCurrent ? " (current)" : ""}`,
              })),
            ]}
          />
        );
      default:
        return null;
    }
  };

  const renderHeaders = () => {
    switch (reportType) {
      case "transactions":
        return (
          <TableRow>
            <TableHeader>Date</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader>Account</TableHeader>
            <TableHeader>Description</TableHeader>
            <TableHeader className="text-right">Amount</TableHeader>
          </TableRow>
        );
      case "scout-summary":
        return (
          <TableRow>
            <TableHeader>Scout</TableHeader>
            <TableHeader>Rank</TableHeader>
            <TableHeader>BSA #</TableHeader>
            <TableHeader>Deposits</TableHeader>
            <TableHeader>Payments</TableHeader>
            <TableHeader>Allocations</TableHeader>
            <TableHeader className="text-right">Balance</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        );
      case "leader-summary":
        return (
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Position</TableHeader>
            <TableHeader>Deposits</TableHeader>
            <TableHeader>Payments</TableHeader>
            <TableHeader>Allocations</TableHeader>
            <TableHeader className="text-right">Balance</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        );
      case "event-summary":
        return (
          <TableRow>
            <TableHeader>Event</TableHeader>
            <TableHeader>Date</TableHeader>
            <TableHeader>Cost</TableHeader>
            <TableHeader>Paid</TableHeader>
            <TableHeader className="text-right">Outstanding</TableHeader>
            <TableHeader className="text-right">Participants</TableHeader>
          </TableRow>
        );
      case "dues-summary":
        return (
          <TableRow>
            <TableHeader>Cycle</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Members</TableHeader>
            <TableHeader className="text-right">Due</TableHeader>
            <TableHeader className="text-right">Paid</TableHeader>
            <TableHeader className="text-right">Outstanding</TableHeader>
            <TableHeader className="text-right">Progress</TableHeader>
          </TableRow>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generate and export custom reports"
        actions={
          report && (report.rows?.length ?? 0) > 0 ? (
            <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
          ) : undefined
        }
      />

      {/* Report type selector */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {REPORT_TYPES.map((rt) => (
              <Button
                key={rt.value}
                variant={reportType === rt.value ? "primary" : "outline"}
                onClick={() => setReportType(rt.value)}
              >
                {rt.label}
              </Button>
            ))}
          </div>

          {/* Filters */}
          {reportType && renderFilters()}
        </CardContent>
      </Card>

      {/* Report results */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-pine" />
        </div>
      ) : report?.rows && report.rows.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-xs text-muted">{report.totalRows} rows</p>
            <Table>
              <TableHead>{renderHeaders()}</TableHead>
              <TableBody>
                {(() => {
                  const rows = (report.rows ?? []) as Record<string, unknown>[];
                  switch (reportType) {
                    case "transactions": {
                      const txRows = rows as Array<{
                        id: string;
                        occurredAt: string;
                        type: string;
                        amountCents: number;
                        scoutName: string | null;
                        leaderName: string | null;
                        bankAccountName: string | null;
                        description: string | null;
                      }>;
                      return txRows.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-muted">
                            {formatDateTime(tx.occurredAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tx.amountCents > 0
                                  ? "success"
                                  : tx.type === "event_allocation" || tx.type === "bank_expense"
                                    ? "destructive"
                                    : "muted"
                              }
                            >
                              {displayName(tx.type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-ink">
                            {tx.scoutName ?? tx.leaderName ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted">{tx.bankAccountName ?? "—"}</TableCell>
                          <TableCell className="text-muted">{tx.description ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={tx.amountCents > 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(tx.amountCents, { sign: true })}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditTx(tx as Tx)}
                                title="Edit transaction"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82H4.158l3.575-3.575L16.862 4.487Zm0 0L19.5 16.5" />
                                </svg>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(tx.id)}
                                title="Delete transaction"
                              >
                                <svg className="h-3.5 w-3.5 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "scout-summary": {
                      const scoutRows = rows as Array<{
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
                      }>;
                      return scoutRows.map((s) => (
                        <TableRow key={s.scoutId}>
                          <TableCell className="font-medium text-ink">
                            {s.firstName} {s.lastName}
                          </TableCell>
                          <TableCell className="text-muted">{s.rank ?? "—"}</TableCell>
                          <TableCell className="font-mono text-muted">{s.bsaNumber ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(s.totalDepositsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(s.totalEventPaymentsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-ember">
                            {formatMoney(s.totalEventAllocationsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={s.balanceCents >= 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(s.balanceCents)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.isActive ? "success" : "muted"}>
                              {s.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "leader-summary": {
                      const leaderRows = rows as Array<{
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
                      }>;
                      return leaderRows.map((l) => (
                        <TableRow key={l.leaderId}>
                          <TableCell className="font-medium text-ink">
                            {l.firstName} {l.lastName}
                          </TableCell>
                          <TableCell className="text-muted">{l.position ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(l.totalDepositsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(l.totalEventPaymentsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-ember">
                            {formatMoney(l.totalEventAllocationsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={l.balanceCents >= 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(l.balanceCents)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.isActive ? "success" : "muted"}>
                              {l.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "event-summary": {
                      const eventRows = rows as Array<{
                        eventId: string;
                        name: string;
                        eventDate: string;
                        description: string | null;
                        totalCostCents: number;
                        totalPaidCents: number;
                        outstandingCents: number;
                        participantCount: number;
                      }>;
                      return eventRows.map((e) => (
                        <TableRow key={e.eventId}>
                          <TableCell className="font-medium text-ink">{e.name}</TableCell>
                          <TableCell className="text-muted">
                            {new Date(e.eventDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {formatMoney(e.totalCostCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(e.totalPaidCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={e.outstandingCents > 0 ? "text-ember" : "text-moss"}>
                              {formatMoney(e.outstandingCents)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">{e.participantCount}</TableCell>
                        </TableRow>
                      ));
                    }
                    case "dues-summary": {
                      const duesRows = rows as Array<{
                        cycleId: string;
                        label: string;
                        isCurrent: boolean;
                        totalDueCents: number;
                        totalPaidCents: number;
                        outstandingCents: number;
                        memberCount: number;
                        paidCount: number;
                      }>;
                      return duesRows.map((d) => (
                        <TableRow key={d.cycleId}>
                          <TableCell className="font-medium text-ink">{d.label}</TableCell>
                          <TableCell>
                            <Badge variant={d.isCurrent ? "success" : "muted"}>
                              {d.isCurrent ? "Current" : "Past"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{d.paidCount}/{d.memberCount}</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {formatMoney(d.totalDueCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(d.totalPaidCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={d.outstandingCents > 0 ? "text-ember" : "text-moss"}>
                              {formatMoney(d.outstandingCents)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {d.memberCount > 0
                              ? `${Math.round((d.paidCount / d.memberCount) * 100)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ));
                    }
                  }
                  return null;
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : reportType ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No data matches your report type.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Edit Transaction Dialog */}
      {editingTx && (
        <Dialog
          open={!!editingTx}
          onClose={() => setEditingTx(null)}
          title="Edit Transaction"
          size="sm"
        >
          <div className="space-y-4">
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="50.00"
            />
            <Input
              label="Date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
            <Input
              label="Description"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Optional note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const cents = parseMoney(editAmount);
                if (cents === null || cents === 0) {
                  toast("Enter a valid amount", "error");
                  return;
                }
                const dateStr = editDate ? new Date(editDate + "T00:00:00").toISOString() : editingTx.occurredAt;
                updateTxMut.mutate({
                  id: editingTx.id,
                  amount: editAmount,
                  description: editDesc,
                  occurredAt: dateStr,
                });
              }}
              disabled={updateTxMut.isPending || !editAmount}
            >
              {updateTxMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Delete Transaction Confirm */}
      {deleteConfirm && (
        <ConfirmDialog
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => deleteTxMut.mutate(deleteConfirm)}
          title="Delete Transaction"
          description="This will permanently remove this transaction. This cannot be undone."
          confirmLabel="Delete"
          destructive
          loading={deleteTxMut.isPending}
        />
      )}
    </div>
  );
}
