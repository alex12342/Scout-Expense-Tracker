import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DuesEntry, DuesCycle, BankAccount } from "../lib/types";
import { formatMoney } from "../lib/money";
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
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "../components/ui";

export default function DuesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedCycle, setSelectedCycle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddCycle, setShowAddCycle] = useState(false);
  const [showEditCycle, setShowEditCycle] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [showUnmarkConfirm, setShowUnmarkConfirm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DuesEntry | null>(null);
  const [editingBankId, setEditingBankId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  const [cycleLabel, setCycleLabel] = useState("");
  const [scoutRate, setScoutRate] = useState("");
  const [leaderRate, setLeaderRate] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentBankId, setPaymentBankId] = useState("");

  const { data: cycles } = useQuery({
    queryKey: ["dues-cycles"],
    queryFn: () => api.listDuesCycles(),
  });

  const { data: entries } = useQuery({
    queryKey: ["dues-entries", selectedCycle],
    queryFn: () => api.listDuesEntries(selectedCycle),
    enabled: !!selectedCycle,
  });

  const { data: summaryData } = useQuery({
    queryKey: ["dues-summary"],
    queryFn: () => api.getDuesSummary(selectedCycle || undefined),
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const { data: scouts } = useQuery({
    queryKey: ["scouts", "active"],
    queryFn: () => api.listScouts(),
  });

  const { data: leaders } = useQuery({
    queryKey: ["leaders", "active"],
    queryFn: () => api.listLeaders(),
  });

  const defaultCycle = cycles && cycles.length > 0
    ? cycles.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
    : null;

  const cycleEntries = entries ?? [];

  const createCycleMut = useMutation({
    mutationFn: () =>
      api.createDuesCycle({
        label: cycleLabel,
        scoutAmountCents: Math.round(parseFloat(scoutRate) * 100),
        leaderAmountCents: Math.round(parseFloat(leaderRate) * 100),
        bankAccountId: editingBankId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dues-cycles"] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setShowAddCycle(false);
      setCycleLabel("");
      setScoutRate("");
      setLeaderRate("");
      setEditingBankId("");
    },
  });

  const updateCycleMut = useMutation({
    mutationFn: (data: {
      id: string;
      label: string;
      scoutAmountCents: number;
      leaderAmountCents: number;
      isCurrent: boolean;
      bankAccountId: string | null;
    }) => api.updateDuesCycle(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dues-cycles"] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setShowEditCycle(false);
    },
  });

  const addMembersMut = useMutation({
    mutationFn: (data: { cycleId: string; members: { memberType: "scout" | "leader"; memberId: string }[] }) =>
      api.addMembersToCycle(data.cycleId, data.members),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setShowAddMembers(false);
      setSelectedMembers(new Set());
    },
  });

  const generateMut = useMutation({
    mutationFn: (cycleId: string) => api.generateDues(cycleId),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
    },
  });

  const deleteCycleMut = useMutation({
    mutationFn: (id: string) => api.deleteDuesCycle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dues-cycles"] });
      if (selectedCycle) setSelectedCycle("");
    },
  });

  const toggleEntryMut = useMutation({
    mutationFn: (id: string) => api.toggleDuesEntry(id),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
    },
  });

  const updateEntryMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; amountCents?: number; dueDate?: string; notes?: string; isWaived?: boolean }) =>
      api.updateDuesEntry(id, data),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setEditingEntry(null);
    },
  });

  const bulkMarkPaidMut = useMutation({
    mutationFn: (ids: string[]) => api.bulkMarkPaid(ids),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setSelectedIds(new Set());
    },
  });

  const bulkToggleMut = useMutation({
    mutationFn: (ids: string[]) => api.bulkToggle(ids),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setSelectedIds(new Set());
    },
  });

  const recordPaymentMut = useMutation({
    mutationFn: ({ duesId, amountCents, bankAccountId }: { duesId: string; amountCents: number; bankAccountId: string }) =>
      api.recordDuesPayment(duesId, amountCents, bankAccountId),
    onSuccess: () => {
      if (selectedCycle) qc.invalidateQueries({ queryKey: ["dues-entries", selectedCycle] });
      qc.invalidateQueries({ queryKey: ["dues-summary"] });
      setShowRecordPayment(false);
      setPaymentAmount("");
      setEditingEntry(null);
    },
  });

  const handleGenerate = (cycleId: string) => {
    if (confirm("This will regenerate all dues entries for this cycle. Continue?")) {
      generateMut.mutate(cycleId);
    }
  };

  const handleDeleteCycle = (id: string, label: string) => {
    if (confirm(`Delete cycle "${label}"? This will also remove all dues entries for this cycle.`)) {
      deleteCycleMut.mutate(id);
    }
  };

  const openEditCycle = (cycle: DuesCycle) => {
    setCycleLabel(cycle.label);
    setScoutRate(String(Math.round(cycle.scoutAmountCents / 100)));
    setLeaderRate(String(Math.round(cycle.leaderAmountCents / 100)));
    setEditingBankId(cycle.bankAccountId ?? "");
    setShowEditCycle(true);
  };

  const summaryRows = summaryData?.summary ?? [];
  const totalAssessed = summaryRows.reduce((s: number, c: any) => s + (c.totalAmountCents ?? 0), 0);
  const totalPaid = summaryRows.reduce((s: number, c: any) => s + (c.paidAmountCents ?? 0), 0);
  const totalWaived = summaryRows.reduce((s: number, c: any) => s + (c.waivedAmountCents ?? 0), 0);
  const totalOutstanding = totalAssessed - totalPaid - totalWaived;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === (cycleEntries?.length ?? 0)) setSelectedIds(new Set());
    else setSelectedIds(new Set(cycleEntries?.map((e) => e.id) ?? []));
  };

  const toggleMemberSelect = (memberType: string, memberId: string) => {
    const key = `${memberType}:${memberId}`;
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getMemberName = (entry: DuesEntry) => {
    if (entry.memberName) return entry.memberName;
    if (entry.memberType === "scout" && entry.memberId) {
      const scout = scouts?.find((s) => s.id === entry.memberId);
      return scout ? `${scout.firstName} ${scout.lastName}` : "";
    }
    if (entry.memberType === "leader" && entry.memberId) {
      const leader = leaders?.find((l) => l.id === entry.memberId);
      return leader ? `${leader.firstName} ${leader.lastName}` : "";
    }
    return "—";
  };

  const getStatusBadge = (entry: DuesEntry) => {
    const status = entry.isWaived ? "waived" : entry.isPaid ? "paid" : entry.dueDate ? (new Date(entry.dueDate) < new Date() ? "overdue" : "unpaid") : "unpaid";
    const variant = status === "paid" ? "success" : status === "waived" ? "muted" : status === "overdue" ? "destructive" : "warning";
    return <Badge variant={variant}>{status}</Badge>;
  };

  const openRecordPayment = (entry: DuesEntry) => {
    setEditingEntry(entry);
    setPaymentAmount(String(Math.round(entry.amountCents / 100)));
    setPaymentBankId("");
    setShowRecordPayment(true);
  };

  return (
    <div>
      <PageHeader title="Dues" description="Manage annual dues cycles and track payments." />

      {/* Cycle selector */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink">Select Cycle:</span>
              <Select
                value={selectedCycle || defaultCycle?.id || ""}
                onChange={(e) => {
                  setSelectedCycle(e.target.value);
                  setSelectedIds(new Set());
                }}
                options={cycles?.map((c) => ({
                  value: c.id,
                  label: `${c.label}${c.isCurrent ? " (Current)" : ""}`,
                })) || []}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAddCycle(true)}>Add Cycle</Button>
              {selectedCycle && cycles && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEditCycle(cycles.find((c) => c.id === selectedCycle)!)}>Edit Cycle</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleGenerate(selectedCycle)}>Generate Entries</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddMembers(true)}>Add Members</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteCycle(selectedCycle, cycles.find((c) => c.id === selectedCycle)?.label || "")}>Delete Cycle</Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      {selectedCycle && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <StatCard
            label="Total Assessed"
            value={formatMoney(totalAssessed)}
            tone="default"
          />
          <StatCard
            label="Total Paid"
            value={formatMoney(totalPaid)}
            tone="positive"
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            tone={totalOutstanding > 0 ? "warning" : "positive"}
          />
        </div>
      )}

      {/* Entries table */}
      {selectedCycle ? (
        <Card>
          <CardContent className="pt-4">
            {entries === undefined ? (
              <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-pine" /></div>
            ) : cycleEntries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No entries for this cycle. Click "Generate Entries" to create.</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === cycleEntries.length && cycleEntries.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4"
                      />
                    </TableHeader>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader className="text-right">Amount</TableHeader>
                    <TableHeader>Due Date</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cycleEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{getMemberName(entry)}</TableCell>
                      <TableCell>
                        <Badge variant="default">{entry.memberType}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">
                        {formatMoney(entry.amountCents)}
                      </TableCell>
                      <TableCell>{entry.dueDate ? new Date(entry.dueDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{getStatusBadge(entry)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!entry.isPaid && !entry.isWaived && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openRecordPayment(entry)}
                            >
                              Record Payment
                            </Button>
                          )}
                          {entry.isPaid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingEntry(entry);
                                setShowUnmarkConfirm(true);
                              }}
                            >
                              Unmark
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted">Select or create a cycle to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-surface shadow-lg">
          <span>{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => bulkMarkPaidMut.mutate([...selectedIds])}>Mark Paid</Button>
          <Button size="sm" variant="secondary" onClick={() => bulkToggleMut.mutate([...selectedIds])}>Toggle</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Add Cycle Dialog */}
      <Dialog open={showAddCycle} onClose={() => setShowAddCycle(false)} title="Add Dues Cycle" size="sm">
        <div className="space-y-4">
          <Input label="Cycle Label" value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} placeholder="2026-2027" />
          <Input label="Scout Rate ($)" type="number" step="0.01" min="0" value={scoutRate} onChange={(e) => setScoutRate(e.target.value)} placeholder="100.00" />
          <Input label="Leader Rate ($)" type="number" step="0.01" min="0" value={leaderRate} onChange={(e) => setLeaderRate(e.target.value)} placeholder="80.00" />
          {bankAccounts && bankAccounts.length > 0 && (
            <Select
              label="Default Bank Account"
              value={editingBankId || bankAccounts[0]?.id || ""}
              onChange={(e) => setEditingBankId(e.target.value)}
              options={bankAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.accountType})` }))}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAddCycle(false)}>Cancel</Button>
          <Button onClick={() => createCycleMut.mutate()} disabled={createCycleMut.isPending || !cycleLabel}>
            {createCycleMut.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Cycle Dialog */}
      <Dialog open={showEditCycle} onClose={() => setShowEditCycle(false)} title="Edit Cycle" size="sm">
        <div className="space-y-4">
          <Input label="Cycle Label" value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} />
          <Input label="Scout Rate ($)" type="number" step="0.01" min="0" value={scoutRate} onChange={(e) => setScoutRate(e.target.value)} />
          <Input label="Leader Rate ($)" type="number" step="0.01" min="0" value={leaderRate} onChange={(e) => setLeaderRate(e.target.value)} />
          {bankAccounts && bankAccounts.length > 0 && (
            <Select
              label="Default Bank Account"
              value={editingBankId || bankAccounts[0]?.id || ""}
              onChange={(e) => setEditingBankId(e.target.value)}
              options={bankAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.accountType})` }))}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowEditCycle(false)}>Cancel</Button>
          <Button onClick={() => {
            const cycle = cycles?.find((c) => c.id === selectedCycle);
            if (cycle) {
              updateCycleMut.mutate({
                id: cycle.id,
                label: cycleLabel,
                scoutAmountCents: Math.round(parseFloat(scoutRate) * 100),
                leaderAmountCents: Math.round(parseFloat(leaderRate) * 100),
                isCurrent: false,
                bankAccountId: editingBankId || null,
              });
            }
          }} disabled={updateCycleMut.isPending || !cycleLabel}>
            {updateCycleMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Add Members Dialog */}
      <Dialog open={showAddMembers} onClose={() => setShowAddMembers(false)} title="Add Members to Cycle" size="md">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          <h4 className="font-medium text-ink">Scouts</h4>
          {scouts?.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedMembers.has(`scout:${s.id}`)}
                onChange={() => toggleMemberSelect("scout", s.id)}
              />
              {s.firstName} {s.lastName}
            </label>
          ))}
          <h4 className="font-medium text-ink">Leaders</h4>
          {leaders?.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedMembers.has(`leader:${l.id}`)}
                onChange={() => toggleMemberSelect("leader", l.id)}
              />
              {l.firstName} {l.lastName}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAddMembers(false)}>Cancel</Button>
          <Button onClick={() => {
            const members = [...selectedMembers].map((key) => {
              const [type, id] = key.split(":");
              return { memberType: type as "scout" | "leader", memberId: id };
            });
            if (members.length > 0 && selectedCycle) {
              addMembersMut.mutate({ cycleId: selectedCycle, members });
            }
          }} disabled={selectedMembers.size === 0 || addMembersMut.isPending}>
            {addMembersMut.isPending ? "Adding…" : `Add ${selectedMembers.size} Members`}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showRecordPayment} onClose={() => setShowRecordPayment(false)} title="Record Payment" size="sm">
        <div className="space-y-4">
          {editingEntry && (
            <p className="text-sm text-muted">
              Record payment for <strong>{getMemberName(editingEntry)}</strong> — Amount: {formatMoney(editingEntry.amountCents)}
            </p>
          )}
          {bankAccounts && bankAccounts.length > 0 && (
            <Select
              label="Bank Account"
              value={paymentBankId || bankAccounts[0]?.id || ""}
              onChange={(e) => setPaymentBankId(e.target.value)}
              options={bankAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.accountType})` }))}
            />
          )}
          <Input label="Amount ($)" type="number" step="0.01" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowRecordPayment(false)}>Cancel</Button>
          <Button onClick={() => {
            const cents = Math.round(parseFloat(paymentAmount) * 100);
            if (!isNaN(cents) && cents > 0 && editingEntry && paymentBankId) {
              recordPaymentMut.mutate({ duesId: editingEntry.id, amountCents: cents, bankAccountId: paymentBankId });
            }
          }} disabled={recordPaymentMut.isPending || !paymentAmount || !paymentBankId}>
            {recordPaymentMut.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Unmark Confirmation Dialog */}
      <Dialog open={showUnmarkConfirm} onClose={() => setShowUnmarkConfirm(false)} title="Confirm Unmark" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Are you sure? This will remove the payment record for <strong>{editingEntry ? getMemberName(editingEntry) : ""}</strong>.
          </p>
          <p className="text-sm text-muted">
            The dues entry will be marked as unpaid. A refund transaction will be created.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowUnmarkConfirm(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => {
            if (editingEntry) {
              toggleEntryMut.mutate(editingEntry.id);
              setShowUnmarkConfirm(false);
            }
          }} disabled={toggleEntryMut.isPending}>
            Confirm Unmark
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
