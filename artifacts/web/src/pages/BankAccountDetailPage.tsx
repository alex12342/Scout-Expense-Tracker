import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Tx } from "../lib/types";
import { formatMoney, formatDateTime, parseMoney } from "../lib/money";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
  ConfirmDialog,
} from "../components/ui";

export default function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [txType, setTxType] = useState("bank_expense");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [editTxAmount, setEditTxAmount] = useState("");
  const [editTxDesc, setEditTxDesc] = useState("");
  const [editTxDate, setEditTxDate] = useState("");
  const [deleteTxConfirm, setDeleteTxConfirm] = useState<string | null>(null);

  const { data: account, isLoading: accLoading } = useQuery({
    queryKey: ["bank-accounts", id],
    queryFn: () => api.getAccount(id!),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["bank-accounts", id, "transactions"],
    queryFn: () => api.accountTransactions(id!),
  });

  const TYPE_DISPLAY: Record<string, string> = {
    scout_deposit: "Deposit",
    reimbursement: "Reimbursement",
    bank_expense: "Bank Expense",
    bank_adjustment: "Bank Adjustment",
    event_allocation: "Event Allocation",
    event_payment: "Event Payment",
    event_refund: "Event Refund",
    dues_payment: "Dues Payment",
    dues_refund: "Dues Refund",
    opening_balance: "Opening Balance",
  };

  const displayName = (type: string) => TYPE_DISPLAY[type] ?? type.replace(/_/g, " ");

  const createTxMut = useMutation({
    mutationFn: () => {
      const cents = parseMoney(txAmount);
      if (cents === null || cents === 0) throw new Error("Enter a valid amount");
      return api.createTransaction({
        type: txType,
        amount: Math.abs(cents) / 100,
        bankAccountId: id,
        description: txDesc || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", id, "transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Transaction recorded", "success");
      setShowAdd(false);
      setTxAmount("");
      setTxDesc("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const updateTxMut = useMutation({
    mutationFn: (data: { id: string; amount: string; description: string; occurredAt: string }) =>
      api.updateTransaction(data.id, {
        amount: data.amount,
        description: data.description || undefined,
        occurredAt: data.occurredAt,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", id, "transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEditingTx(null);
      toast("Transaction updated", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteTxMut = useMutation({
    mutationFn: (txId: string) => api.deleteTransaction(txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", id, "transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTxConfirm(null);
      toast("Transaction deleted", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const openEditTx = (tx: Tx) => {
    setEditingTx(tx);
    setEditTxAmount((tx.amountCents / 100).toFixed(2));
    setEditTxDesc(tx.description ?? "");
    setEditTxDate(new Date(tx.occurredAt).toISOString().split("T")[0]);
  };

  if (accLoading) {
    return <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>;
  }

  return (
    <div>
      <Link href="/bank-accounts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-pine">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Accounts
      </Link>

      <PageHeader
        title={account?.name ?? "Account"}
        description={account?.last4 ? `•••• ${account.last4}` : undefined}
        actions={<Button onClick={() => setShowAdd(true)}>Record Transaction</Button>}
      />

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Badge variant={account?.accountType === "checking" ? "default" : "success"}>
            {account?.accountType}
          </Badge>
          <span className="font-mono text-2xl font-semibold tnum text-ink">
            {formatMoney(txData?.balanceCents ?? account?.balanceCents ?? 0)}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Transaction History</h2>
          {txLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !txData || txData.entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No transactions yet.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Scout</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                  <TableHeader className="text-center">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {txData.entries.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-muted">
                      {formatDateTime(tx.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tx.amountCents > 0 ? "success" : tx.type === "bank_expense" ? "destructive" : "muted"
                        }
                      >
                        {displayName(tx.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted">
                      {tx.scoutName ?? "—"}
                    </TableCell>
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
                          onClick={() => openEditTx(tx)}
                          title="Edit transaction"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82H4.158l3.575-3.575L16.862 4.487Zm0 0L19.5 16.5" />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTxConfirm(tx.id)}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Record Transaction" size="sm">
        <div className="space-y-4">
          <Select
            label="Type"
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            options={[
              { value: "bank_expense", label: "Expense (money out)" },
              { value: "bank_adjustment", label: "Adjustment (correction)" },
            ]}
          />
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            min="0"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            placeholder="100.00"
            prefix="$"
          />
          <Input
            label="Description"
            value={txDesc}
            onChange={(e) => setTxDesc(e.target.value)}
            placeholder="e.g., Camping supply restock"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button onClick={() => createTxMut.mutate()} disabled={createTxMut.isPending}>
            {createTxMut.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </Dialog>

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
              value={editTxAmount}
              onChange={(e) => setEditTxAmount(e.target.value)}
              placeholder="50.00"
            />
            <Input
              label="Date"
              type="date"
              value={editTxDate}
              onChange={(e) => setEditTxDate(e.target.value)}
            />
            <Input
              label="Description"
              value={editTxDesc}
              onChange={(e) => setEditTxDesc(e.target.value)}
              placeholder="Optional note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const cents = parseMoney(editTxAmount);
                if (cents === null || cents === 0) {
                  toast("Enter a valid amount", "error");
                  return;
                }
                const dateStr = editTxDate ? new Date(editTxDate + "T00:00:00").toISOString() : editingTx.occurredAt;
                updateTxMut.mutate({
                  id: editingTx.id,
                  amount: editTxAmount,
                  description: editTxDesc,
                  occurredAt: dateStr,
                });
              }}
              disabled={updateTxMut.isPending || !editTxAmount}
            >
              {updateTxMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Delete Transaction Confirm */}
      {deleteTxConfirm && (
        <ConfirmDialog
          open={!!deleteTxConfirm}
          onClose={() => setDeleteTxConfirm(null)}
          onConfirm={() => deleteTxMut.mutate(deleteTxConfirm)}
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
