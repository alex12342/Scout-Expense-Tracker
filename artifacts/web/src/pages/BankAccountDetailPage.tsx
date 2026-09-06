import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
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
} from "../components/ui";

export default function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [txType, setTxType] = useState("bank_expense");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const { data: account, isLoading: accLoading } = useQuery({
    queryKey: ["bank-accounts", id],
    queryFn: () => api.getAccount(id!),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["bank-accounts", id, "transactions"],
    queryFn: () => api.accountTransactions(id!),
  });

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
                        {tx.type.replace(/_/g, " ")}
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
    </div>
  );
}
