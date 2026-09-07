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
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  useToast,
} from "../components/ui";

export default function ScoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddTx, setShowAddTx] = useState(false);
  const [txType, setTxType] = useState("scout_deposit");
  const [txAccountId, setTxAccountId] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const { data: scout, isLoading: scoutLoading } = useQuery({
    queryKey: ["scouts", id],
    queryFn: () => api.getScout(id!),
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["scouts", id, "ledger"],
    queryFn: () => api.scoutLedger(id!),
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const createTxMut = useMutation({
    mutationFn: () => {
      const cents = parseMoney(txAmount);
      if (cents === null || cents === 0) throw new Error("Enter a valid amount");
      const needsAccount = txType === "scout_deposit" || txType === "reimbursement";
      return api.createTransaction({
        type: txType,
        amount: Math.abs(cents) / 100,
        scoutId: id,
        bankAccountId: needsAccount ? (txAccountId || accounts?.[0]?.id) : undefined,
        description: txDesc || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouts"] });
      qc.invalidateQueries({ queryKey: ["scouts", id, "ledger"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Transaction recorded", "success");
      setShowAddTx(false);
      setTxAmount("");
      setTxDesc("");
      setTxAccountId("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (scoutLoading) {
    return <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>;
  }

  const balance = ledger?.balanceCents ?? scout?.balanceCents ?? 0;

  return (
    <div>
      <Link href="/scouts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-pine">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Scouts
      </Link>

      <PageHeader
        title={scout?.name ?? "Scout"}
        description={scout?.rank ? `${scout.rank}${scout.bsaNumber ? ` · BSA #${scout.bsaNumber}` : ""}` : undefined}
        actions={<Button onClick={() => setShowAddTx(true)}>Record Transaction</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4">
        <StatCard
          label="Balance"
          value={formatMoney(balance)}
          tone={balance < 0 ? "negative" : balance > 0 ? "positive" : "default"}
          sub={balance < 0 ? "Owes troop" : balance > 0 ? "Troop owes scout" : "Even"}
        />
        <StatCard
          label="Status"
          value={scout?.isActive ? "Active" : "Inactive"}
          tone={scout?.isActive ? "positive" : "default"}
        />
      </div>

      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Transaction History</h2>
          {ledgerLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !ledger || ledger.entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No transactions recorded yet.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledger.entries.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-muted">
                      {formatDateTime(tx.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tx.type === "scout_deposit" || tx.type === "event_payment"
                            ? "success"
                            : tx.type === "reimbursement" || tx.type === "event_allocation"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {tx.type.replace(/_/g, " ")}
                      </Badge>
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

      {/* Add Transaction Dialog */}
      <Dialog open={showAddTx} onClose={() => setShowAddTx(false)} title="Record Transaction" size="sm">
        <div className="space-y-4">
          <Select
            label="Type"
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            options={[
              { value: "scout_deposit", label: "Scout Deposit (scout pays troop)" },
              { value: "reimbursement", label: "Reimbursement (troop pays scout)" },
              { value: "scout_adjustment", label: "Adjustment (correction)" },
            ]}
          />
          {(txType === "scout_deposit" || txType === "reimbursement") && accounts && accounts.length > 0 && (
            <Select
              label="Bank Account"
              value={txAccountId || accounts[0]?.id || ""}
              onChange={(e) => setTxAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.accountType})` }))}
            />
          )}
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            min="0"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            placeholder="50.00"
            prefix="$"
          />
          <Input
            label="Description"
            value={txDesc}
            onChange={(e) => setTxDesc(e.target.value)}
            placeholder="Optional note"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAddTx(false)}>Cancel</Button>
          <Button onClick={() => createTxMut.mutate()} disabled={createTxMut.isPending}>
            {createTxMut.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
