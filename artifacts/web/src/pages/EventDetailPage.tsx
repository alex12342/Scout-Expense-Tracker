import { useState, useEffect } from "react";
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
import type { EventField, EventParticipant, EventLineItem } from "../lib/types";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [payScoutId, setPayScoutId] = useState<string | null>(null);
  const [payLeaderId, setPayLeaderId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [refundScoutId, setRefundScoutId] = useState<string | null>(null);
  const [refundLeaderId, setRefundLeaderId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [showFields, setShowFields] = useState(false);
  const [fields, setFields] = useState<EventField[]>([]);
  const [savingFields, setSavingFields] = useState(false);
  const [showUpdateCosts, setShowUpdateCosts] = useState(false);
  const [lineItems, setLineItems] = useState<EventLineItem[]>([]);

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", id],
    queryFn: () => api.getEvent(id!),
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });
  const [payAccountId, setPayAccountId] = useState("");

  const effectiveAccountId = payAccountId || accounts?.[0]?.id || "";

  // Load event fields and line items
  const loadFields = () => {
    const raw = (event as { fields?: EventField[] | null } | null)?.fields;
    if (!raw) return;
    setFields(raw.map((f) => ({ key: f.key, value: f.value })));
  };

  const loadLineItems = () => {
    const raw = (event as { lineItems?: EventLineItem[] | null } | null)?.lineItems;
    if (!raw) return;
    setLineItems(raw.map((li) => ({ ...li })));
  };

  useEffect(() => {
    if (event) loadFields();
  }, [event]);

  useEffect(() => {
    if (event) loadLineItems();
  }, [event]);

  const saveFieldsMut = useMutation({
    mutationFn: async () => {
      await api.updateEvent(id!, { fields: fields as EventField[] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", id] });
      toast("Fields saved", "success");
      setShowFields(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const saveCostsMut = useMutation({
    mutationFn: async () => {
      const validItems = lineItems.filter((item) => item.name.trim() && item.amountCents > 0);
      if (validItems.length === 0) throw new Error("Add at least one valid line item");
      return api.updateEventCosts(id!, { lineItems: validItems });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast("Costs updated", "success");
      setShowUpdateCosts(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const payMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(payAmount);
      if (isNaN(amt) || amt <= 0) throw new Error("Enter a valid amount");
      return api.recordPayment(id!, {
        scoutId: payScoutId ?? undefined,
        leaderId: payLeaderId ?? undefined,
        amount: amt,
        bankAccountId: effectiveAccountId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Payment recorded", "success");
      setPayScoutId(null);
      setPayLeaderId(null);
      setPayAmount("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const refundMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(refundAmount);
      if (isNaN(amt) || amt <= 0) throw new Error("Enter a valid amount");
      return api.recordRefund(id!, {
        scoutId: refundScoutId ?? undefined,
        leaderId: refundLeaderId ?? undefined,
        amount: amt,
        bankAccountId: effectiveAccountId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Refund recorded", "success");
      setRefundScoutId(null);
      setRefundLeaderId(null);
      setRefundAmount("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>;
  }

  if (!event) return <p className="text-ember">Event not found.</p>;

  const participants = event.participants ?? [];
  const estimatedTotal = (event as { estimatedTotalCents?: number }).estimatedTotalCents ?? 0;
  const outstanding = (event.outstandingCents ?? 0);

  // CSV export
  const exportCSV = () => {
    const header = "Name,Estimated,Paid,Outstanding,Status\n";
    const rows = participants.map((p) => {
      const outstandingP = p.estimatedAllocatedCents - p.amountPaidCents;
      const status = outstandingP <= 0 ? "Paid" : outstandingP < p.estimatedAllocatedCents ? "Partial" : "Unpaid";
      const name = p.scoutName ?? p.leaderName ?? "Unknown";
      return `${name},${(p.estimatedAllocatedCents / 100).toFixed(2)},${(p.amountPaidCents / 100).toFixed(2)},${(outstandingP / 100).toFixed(2)},${status}`;
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
            <Button variant="outline" onClick={() => setShowFields(true)}>Edit Fields</Button>
            <Button variant="outline" onClick={() => setShowUpdateCosts(true)}>Update Costs</Button>
            <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
            <Button onClick={() => { setPayScoutId(participants[0]?.scoutId ?? null); setPayAmount(""); }}>Record Payment</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Estimated Total" value={formatMoney(estimatedTotal)} />
        <StatCard label="Collected" value={formatMoney(event.totalPaidCents ?? 0)} tone="positive" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "negative" : "positive"} />
      </div>

      {/* Line Items */}
      {(event as { lineItems?: EventLineItem[] | null }).lineItems && (event as { lineItems?: EventLineItem[] | null }).lineItems!.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Cost Breakdown</h2>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Item</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                  <TableHeader className="text-right">Applied To</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {(event as { lineItems?: EventLineItem[] | null }).lineItems!.map((item: EventLineItem, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right font-mono tnum">{formatMoney(item.amountCents)}</TableCell>
                    <TableCell className="text-right text-sm text-muted">{item.participantTypes.join(", ")}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono tnum">{formatMoney(estimatedTotal)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                  <TableHeader>Name</TableHeader>
                  <TableHeader className="text-right">Estimated</TableHeader>
                  <TableHeader className="text-right">Paid</TableHeader>
                  <TableHeader className="text-right">Outstanding</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {participants.map((p) => {
                  const pOutstanding = p.estimatedAllocatedCents - p.amountPaidCents;
                  const name = p.scoutName ?? p.leaderName ?? "Unknown";
                  const isScout = !!p.scoutId;
                  const linkHref = isScout ? `/scouts/${p.scoutId}` : `/leaders/${p.leaderId}`;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={linkHref} className="font-medium text-ink hover:text-pine">
                          {name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">{formatMoney(p.estimatedAllocatedCents)}</TableCell>
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
                            onClick={() => {
                              if (isScout) setPayScoutId(p.scoutId!);
                              else setPayLeaderId(p.leaderId!);
                              setPayAmount("");
                            }}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-pine hover:bg-pine-soft"
                          >
                            Pay
                          </button>
                          {p.amountPaidCents > 0 && (
                            <button
                              onClick={() => {
                                if (isScout) setRefundScoutId(p.scoutId!);
                                else setRefundLeaderId(p.leaderId!);
                                setRefundAmount("");
                              }}
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

      {/* Cost Changes History */}
      {(event as { costChanges?: any[] | null }).costChanges && (event as { costChanges?: any[] | null }).costChanges!.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Cost Changes</h2>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader className="text-right">Old Amount</TableHeader>
                  <TableHeader className="text-right">New Amount</TableHeader>
                  <TableHeader>Note</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {(event as { costChanges?: Array<{ id: string; createdAt: string; action: string; oldAmountCents: number | null; newAmountCents: number | null; note: string | null }> | null }).costChanges!.map((change: { id: string; createdAt: string; action: string; oldAmountCents: number | null; newAmountCents: number | null; note: string | null }, i: number) => (
                  <TableRow key={change.id}>
                    <TableCell className="text-muted">{formatDateTime(change.createdAt)}</TableCell>
                    <TableCell className="text-muted capitalize">{change.action.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-mono tnum">{formatMoney(change.oldAmountCents ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono tnum">{formatMoney(change.newAmountCents ?? 0)}</TableCell>
                    <TableCell className="text-muted">{change.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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

      {/* Optional Fields Editor */}
      <Dialog open={showFields} onClose={() => setShowFields(false)} title="Edit Optional Fields" size="md">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-muted">Add custom fields for this event (e.g., equipment needs, special instructions).</p>
          {fields.map((field, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input
                value={field.key}
                onChange={(e) => setFields(fields.map((f, j) => j === i ? { ...f, key: e.target.value } : f))}
                placeholder="Field name"
                className="flex-1"
              />
              <Input
                value={field.value}
                onChange={(e) => setFields(fields.map((f, j) => j === i ? { ...f, value: e.target.value } : f))}
                placeholder="Value"
                className="flex-1"
              />
              <Button variant="ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))} className="text-ember">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFields([...fields, { key: "", value: "" }])} size="sm">
            + Add Field
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowFields(false)}>Cancel</Button>
          <Button onClick={() => saveFieldsMut.mutate()} disabled={saveFieldsMut.isPending}>
            {saveFieldsMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Update Costs Dialog */}
      <Dialog open={showUpdateCosts} onClose={() => setShowUpdateCosts(false)} title="Update Costs" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-muted">Edit line items to update the event cost breakdown. Changes will be applied to all participants.</p>
          {lineItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item.name}
                onChange={(e) => setLineItems(lineItems.map((it, j) => j === i ? { ...it, name: e.target.value } : it))}
                placeholder="Item name"
                className="flex-1"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={item.amountCents || ""}
                onChange={(e) => setLineItems(lineItems.map((it, j) => j === i ? { ...it, amountCents: parseFloat(e.target.value) || 0 } : it))}
                placeholder="0.00"
                prefix="$"
                className="w-32"
              />
              <div className="flex gap-1">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.participantTypes?.includes("scout") ?? false}
                    onChange={(e) => {
                      const types = e.target.checked
                        ? [...new Set([...(item.participantTypes ?? []), "scout"])]
                        : (item.participantTypes ?? []).filter((t) => t !== "scout");
                      setLineItems(lineItems.map((it, j) => j === i ? { ...it, participantTypes: types } : it));
                    }}
                    className="h-3 w-3"
                  />
                  Scouts
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.participantTypes?.includes("leader") ?? false}
                    onChange={(e) => {
                      const types = e.target.checked
                        ? [...new Set([...(item.participantTypes ?? []), "leader"])]
                        : (item.participantTypes ?? []).filter((t) => t !== "leader");
                      setLineItems(lineItems.map((it, j) => j === i ? { ...it, participantTypes: types } : it));
                    }}
                    className="h-3 w-3"
                  />
                  Leaders
                </label>
              </div>
              <button
                onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))}
                className="text-ember hover:text-ember/80"
                disabled={lineItems.length <= 1}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setLineItems([...lineItems, { name: "", amountCents: 0, participantTypes: ["everyone"] }])} size="sm">
            + Add Item
          </Button>
          <p className="text-sm font-medium">Total: {formatMoney(lineItems.reduce((s, item) => s + item.amountCents, 0))}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowUpdateCosts(false)}>Cancel</Button>
          <Button onClick={() => saveCostsMut.mutate()} disabled={saveCostsMut.isPending}>
            {saveCostsMut.isPending ? "Updating…" : "Update Costs"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payScoutId !== null} onClose={() => setPayScoutId(null)} title="Record Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Recording payment toward event: <strong>{event.name}</strong>
          </p>
          {accounts && accounts.length > 0 && (
            <Select
              label="Deposit To"
              value={effectiveAccountId}
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
