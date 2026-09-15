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

const typeOptions = [
  { value: "", label: "All types" },
  { value: "opening_balance", label: "Opening Balance" },
  { value: "scout_deposit", label: "Deposit" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "event_allocation", label: "Event Allocation" },
  { value: "event_payment", label: "Event Payment" },
  { value: "event_refund", label: "Event Refund" },
  { value: "bank_expense", label: "Bank Expense" },
  { value: "bank_adjustment", label: "Bank Adjustment" },
  { value: "scout_adjustment", label: "Scout Adjustment" },
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

export default function LedgerPage() {
  const [scoutFilter, setScoutFilter] = useState("");
  const [leaderFilter, setLeaderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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

  const { data: txs, isLoading } = useQuery({
    queryKey: ["ledger", scoutFilter, leaderFilter, typeFilter, fromDate, toDate],
    queryFn: () =>
      api.listLedger({
        scoutId: scoutFilter || undefined,
        leaderId: leaderFilter || undefined,
        type: typeFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        limit: 200,
      }),
  });

  const updateTxMut = useMutation({
    mutationFn: (data: { id: string; amount: string; description: string; occurredAt: string }) =>
      api.updateTransaction(data.id, {
        amount: data.amount,
        description: data.description || undefined,
        occurredAt: data.occurredAt,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setEditingTx(null);
      toast("Transaction updated", "success");
    },
    onError: (err: { message: string }) => toast(err.message, "error"),
  });

  const deleteTxMut = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setDeleteConfirm(null);
      toast("Transaction deleted", "success");
    },
    onError: (err: { message: string }) => toast(err.message, "error"),
  });

  const openEdit = (tx: Tx) => {
    setEditingTx(tx);
    setEditAmount((tx.amountCents / 100).toFixed(2));
    setEditDesc(tx.description ?? "");
    setEditDate(new Date(tx.occurredAt).toISOString().split("T")[0]);
  };

  const exportCSV = () => {
    if (!txs) return;
    const header = "Date,Type,Scout,Account,Description,Amount\n";
    const rows = txs.map((tx) =>
      [
        new Date(tx.occurredAt).toISOString().slice(0, 10),
        tx.type,
        tx.scoutName ?? tx.leaderName ?? "",
        tx.bankAccountName ?? "",
        `"${(tx.description ?? "").replace(/"/g, '""')}"`,
        (tx.amountCents / 100).toFixed(2),
      ].join(","),
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Transaction Ledger"
        description="Complete transaction history"
        actions={<Button variant="outline" onClick={exportCSV}>Export CSV</Button>}
      />

      {/* Filters */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          value={scoutFilter}
          onChange={(e) => setScoutFilter(e.target.value)}
          placeholder="All scouts"
          options={(scouts ?? []).map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))}
        />
        <Select
          value={leaderFilter}
          onChange={(e) => setLeaderFilter(e.target.value)}
          placeholder="All leaders"
          options={(leaders ?? []).map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` }))}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="All types"
          options={typeOptions}
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

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>
      ) : !txs || txs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No transactions match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-xs text-muted">{txs.length} transactions</p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Account</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                  <TableHeader className="text-center">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {txs.map((tx) => (
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
                    <TableCell className="text-ink">{tx.scoutName ?? tx.leaderName ?? "—"}</TableCell>
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
                          onClick={() => openEdit(tx)}
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {editingTx && (
        <Dialog
          open={!!editingTx}
          onClose={() => setEditingTx(null)}
          title="Edit Transaction"
          size="sm"
        >
          <div className="space-y-4">
            <Select
              label="Type"
              value={editingTx.type}
              onChange={(e) => {
                const type = e.target.value as Tx["type"];
                setEditingTx({ ...editingTx, type });
              }}
              options={typeOptions.filter((o) => o.value)}
            />
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

      {/* Delete Confirm */}
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
