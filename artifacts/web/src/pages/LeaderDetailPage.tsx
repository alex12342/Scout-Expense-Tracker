import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { api } from "../lib/api";
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
  TableHead,
  TableHeader,
  TableCell,
  TableRow,
  useToast,
} from "../components/ui";

const LEADER_POSITIONS = [
  "Scoutmaster",
  "Assistant Scoutmaster",
  "Cubmaster",
  "Assistant Cubmaster",
  "Den Chief",
  "Treasurer",
  "Secretary",
  "Troutmaster",
  "Scribe",
  "Other",
];

export default function LeaderDetailPage() {
  const [, params] = useRoute("/leaders/:id");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [txType, setTxType] = useState("scout_deposit");
  const [txAccountId, setTxAccountId] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");
  const [applyToDues, setApplyToDues] = useState(false);

  const { data: leader, isLoading } = useQuery({
    queryKey: ["leader", params?.id],
    queryFn: () => api.getLeader(params!.id),
    enabled: !!params?.id,
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["leader-ledger", params?.id],
    queryFn: () => api.leaderLedger(params!.id),
    enabled: !!params?.id,
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const { data: duesEntries } = useQuery({
    queryKey: ["leader", params?.id, "dues"],
    queryFn: async () => {
      const allCycles = await api.listDuesCycles();
      const allEntries = await Promise.all(allCycles.map((c) => api.listDuesEntries(c.id)));
      const flat = allEntries.flat();
      return flat.filter((e) => e.memberType === "leader" && e.memberId === params?.id);
    },
    enabled: !!params?.id,
  });

  const totalAssessed = duesEntries?.reduce((s, e) => s + e.amountCents, 0) ?? 0;
  const totalPaid = duesEntries?.filter((e) => e.isPaid).reduce((s, e) => s + e.amountCents, 0) ?? 0;
  const totalRemaining = totalAssessed - totalPaid;

  const updateMut = useMutation({
    mutationFn: () =>
      api.updateLeader(params!.id, {
        firstName: editFirstName,
        lastName: editLastName,
        position: editPosition || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader", params?.id] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      toast("Leader updated", "success");
      setShowEdit(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deactivateMut = useMutation({
    mutationFn: () =>
      api.updateLeader(params!.id, { isActive: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader", params?.id] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      toast("Leader deactivated", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const activateMut = useMutation({
    mutationFn: () =>
      api.updateLeader(params!.id, { isActive: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader", params?.id] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      toast("Leader activated", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteLeader(params!.id),
    onSuccess: () => {
      toast("Leader removed", "success");
      window.location.href = "/leaders";
    },
    onError: (err) => toast(err.message, "error"),
  });

  const createTxMut = useMutation({
    mutationFn: () => {
      const cents = parseMoney(txAmount);
      if (cents === null || cents === 0) throw new Error("Enter a valid amount");
      const needsAccount = txType === "scout_deposit" || txType === "reimbursement";
      return api.createTransaction({
        type: txType,
        amount: Math.abs(cents) / 100,
        leaderId: params?.id,
        bankAccountId: needsAccount ? (txAccountId || accounts?.[0]?.id) : undefined,
        description: txDesc || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      qc.invalidateQueries({ queryKey: ["leader-ledger", params?.id] });
      qc.invalidateQueries({ queryKey: ["leader", params?.id, "dues"] });
      toast("Transaction recorded", "success");
      setShowAddTx(false);
      setTxAmount("");
      setTxDesc("");
      setTxAccountId("");
      setApplyToDues(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const applyDepositMut = useMutation({
    mutationFn: (amountCents: number) =>
      api.applyDeposit("leader", params!.id, amountCents, txAccountId || accounts?.[0]?.id || ""),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      qc.invalidateQueries({ queryKey: ["leader-ledger", params?.id] });
      qc.invalidateQueries({ queryKey: ["leader", params?.id, "dues"] });
      if (data.remaining > 0) {
        toast(`Applied to dues. Remaining balance: ${formatMoney(data.remaining / 100)}`, "info");
      } else {
        toast("Deposit applied to outstanding dues", "success");
      }
      setShowAddTx(false);
      setTxAmount("");
      setTxDesc("");
      setTxAccountId("");
      setApplyToDues(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="h-6 w-6 text-pine" />
      </div>
    );
  }

  if (!leader) {
    return <p className="py-10 text-center text-muted">Leader not found.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${leader.firstName} ${leader.lastName}`}
        description={leader.position ?? "Leader"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => {
              setEditFirstName(leader.firstName);
              setEditLastName(leader.lastName);
              setEditPosition(leader.position ?? "");
              setShowEdit(true);
            }}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setDeleteConfirm(true)}>
              Delete
            </Button>
          </div>
        }
      />

      {/* Info card */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">First Name</dt>
              <dd className="font-medium">{leader.firstName}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Last Name</dt>
              <dd className="font-medium">{leader.lastName}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Position</dt>
              <dd className="font-medium">{leader.position ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Status</dt>
              <dd>
                {leader.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="muted">Inactive</Badge>
                )}
              </dd>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dues summary across all cycles */}
      {duesEntries && duesEntries.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Dues Summary (All Cycles)</h3>
                <p className="text-xs text-muted">
                  Assessed: {formatMoney(totalAssessed)} · Paid: {formatMoney(totalPaid)} · Remaining: {formatMoney(totalRemaining)}
                </p>
              </div>
              <a href="/dues">
                <Button variant="outline" size="sm">View Dues</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Ledger Balance</span>
            <span
              className={`font-mono text-lg tnum ${
                (leader.balanceCents ?? 0) < 0
                  ? "text-ember"
                  : (leader.balanceCents ?? 0) > 0
                    ? "text-moss"
                    : "text-ink"
              }`}
            >
              {formatMoney(leader.balanceCents ?? 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      {ledgerData && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="mb-3 font-display text-base font-semibold text-ink">Ledger History</h3>
            {!ledgerData.entries.length ? (
              <p className="py-6 text-center text-sm text-muted">No ledger entries.</p>
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
                  {ledgerData.entries.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted">
                        {formatDateTime(tx.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted" className="capitalize">
                          {tx.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted">
                        {tx.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">
                        <span
                          className={
                            tx.amountCents < 0
                              ? "text-ember"
                              : tx.amountCents > 0
                                ? "text-moss"
                                : "text-ink"
                          }
                        >
                          {formatMoney(tx.amountCents)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Transaction Dialog */}
      <Dialog
        open={showAddTx}
        onClose={() => setShowAddTx(false)}
        title="Record Transaction"
        size="sm"
      >
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
          />
          {txType === "scout_deposit" && duesEntries && duesEntries.some((e) => !e.isPaid && !e.isWaived) && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="applyToDues"
                checked={applyToDues}
                onChange={(e) => setApplyToDues(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="applyToDues" className="text-sm text-ink">
                Apply to outstanding dues
              </label>
            </div>
          )}
          <Input
            label="Description"
            value={txDesc}
            onChange={(e) => setTxDesc(e.target.value)}
            placeholder="Optional note"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAddTx(false)}>Cancel</Button>
          <Button onClick={() => {
            const cents = parseMoney(txAmount);
            if (cents === null || cents === 0) {
              toast("Enter a valid amount", "error");
              return;
            }
            const needsAccount = txType === "scout_deposit" || txType === "reimbursement";
            const bankId = needsAccount ? (txAccountId || accounts?.[0]?.id) : undefined;

            if (applyToDues && txType === "scout_deposit" && bankId) {
              applyDepositMut.mutate(Math.abs(cents));
            } else {
              createTxMut.mutate();
            }
          }} disabled={createTxMut.isPending || applyDepositMut.isPending || !txAmount}>
            {createTxMut.isPending || applyDepositMut.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Leader"
        size="sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              autoFocus
            />
            <Input
              label="Last Name"
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
            />
          </div>
          <Select
            label="Position"
            value={editPosition}
            onChange={(e) => setEditPosition(e.target.value)}
            placeholder="Select position"
            options={[
              { value: "", label: "Select position" },
              ...LEADER_POSITIONS.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
          <Button
            onClick={() => updateMut.mutate()}
            disabled={!editFirstName.trim() || updateMut.isPending}
          >
            {updateMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => deleteMut.mutate()}
        title="Delete Leader"
        description="This will permanently remove this leader and all their financial records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  );
}
