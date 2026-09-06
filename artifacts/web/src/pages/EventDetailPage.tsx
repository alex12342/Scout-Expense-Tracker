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

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [payScoutId, setPayScoutId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [refundScoutId, setRefundScoutId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", id],
    queryFn: () => api.getEvent(id!),
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });
  const [payAccountId, setPayAccountId] = useState(accounts?.[0]?.id ?? "");

  const payMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(payAmount);
      if (isNaN(amt) || amt <= 0) throw new Error("Enter a valid amount");
      return api.recordPayment(id!, {
        scoutId: payScoutId!,
        amount: amt,
        bankAccountId: payAccountId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Payment recorded", "success");
      setPayScoutId(null);
      setPayAmount("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const refundMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(refundAmount);
      if (isNaN(amt) || amt <= 0) throw new Error("Enter a valid amount");
      return api.recordRefund(id!, {
        scoutId: refundScoutId!,
        amount: amt,
        bankAccountId: payAccountId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Refund recorded", "success");
      setRefundScoutId(null);
      setRefundAmount("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>;
  }

  if (!event) return <p className="text-ember">Event not found.</p>;

  const participants = event.participants ?? [];
  const outstanding = (event.outstandingCents ?? 0);

  // CSV export
  const exportCSV = () => {
    const header = "Scout,Allocated,Paid,Outstanding,Status\n";
    const rows = participants.map((p) => {
      const outstandingP = p.amountAllocatedCents - p.amountPaidCents;
      const status = outstandingP <= 0 ? "Paid" : outstandingP < p.amountAllocatedCents ? "Partial" : "Unpaid";
      return `${p.scoutName ?? "Unknown"},${(p.amountAllocatedCents / 100).toFixed(2)},${(p.amountPaidCents / 100).toFixed(2)},${(outstandingP / 100).toFixed(2)},${status}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name.replace(/\s+/g, "_")}_ledger.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Link href="/events" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-pine">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Events
      </Link>

      <PageHeader
        title={event.name}
        description={`${new Date(event.eventDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}${event.description ? ` · ${event.description}` : ""}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
            <Button onClick={() => { setPayScoutId(participants[0]?.scoutId ?? null); setPayAmount(""); }}>Record Payment</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Total Cost" value={formatMoney(event.totalCostCents)} />
        <StatCard label="Collected" value={formatMoney(event.totalPaidCents ?? 0)} tone="positive" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "negative" : "positive"} />
      </div>

      {/* Participants Table */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Participant Splits</h2>
          {participants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No participants.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Scout</TableHeader>
                  <TableHeader className="text-right">Allocated</TableHeader>
                  <TableHeader className="text-right">Paid</TableHeader>
                  <TableHeader className="text-right">Outstanding</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {participants.map((p) => {
                  const pOutstanding = p.amountAllocatedCents - p.amountPaidCents;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/scouts/${p.scoutId}`} className="font-medium text-ink hover:text-pine">
                          {p.scoutName ?? "Unknown"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">{formatMoney(p.amountAllocatedCents)}</TableCell>
                      <TableCell className="text-right font-mono tnum">{formatMoney(p.amountPaidCents)}</TableCell>
                      <TableCell className="text-right font-mono tnum">
                        <span className={pOutstanding > 0 ? "text-ember" : "text-moss"}>
                          {formatMoney(pOutstanding)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {pOutstanding <= 0 ? (
                          <Badge variant="success">Paid</Badge>
                        ) : p.amountPaidCents > 0 ? (
                          <Badge variant="warning">Partial</Badge>
                        ) : (
                          <Badge variant="destructive">Unpaid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => { setPayScoutId(p.scoutId); setPayAmount(""); }}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-pine hover:bg-pine-soft"
                          >
                            Pay
                          </button>
                          {p.amountPaidCents > 0 && (
                            <button
                              onClick={() => { setRefundScoutId(p.scoutId); setRefundAmount(""); }}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-ember hover:bg-ember-soft"
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payments History */}
      {(event.payments ?? []).length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Payment History</h2>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Scout</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {(event.payments ?? []).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted">{formatDateTime(tx.occurredAt)}</TableCell>
                    <TableCell>{tx.scoutName ?? "—"}</TableCell>
                    <TableCell className="text-muted">{tx.description ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tnum">
                      <span className="text-moss">{formatMoney(tx.amountCents, { sign: true })}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={payScoutId !== null} onClose={() => setPayScoutId(null)} title="Record Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Recording payment toward event: <strong>{event.name}</strong>
          </p>
          {accounts && accounts.length > 0 && (
            <Select
              label="Deposit To"
              value={payAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.accountType})` }))}
            />
          )}
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            min="0"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            placeholder="50.00"
            prefix="$"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPayScoutId(null)}>Cancel</Button>
          <Button onClick={() => payMut.mutate()} disabled={payMut.isPending}>
            {payMut.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundScoutId !== null} onClose={() => setRefundScoutId(null)} title="Record Refund" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Refunding payment from event: <strong>{event.name}</strong>
          </p>
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            min="0"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="50.00"
            prefix="$"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRefundScoutId(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => refundMut.mutate()} disabled={refundMut.isPending}>
            {refundMut.isPending ? "Processing…" : "Record Refund"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
