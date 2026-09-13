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
  StatCard,
  Switch,
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
  "Committee Member",
  "Quartermaster",
  "Charter Org Rep",
  "Advancement Chair",
  "Committee Chair",
  "Eagle Guide",
];

export default function LeaderDetailPage() {
  const [, params] = useRoute("/leaders/:id");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editActive, setEditActive] = useState(false);
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

  const totalAssessed = leader?.duesBreakdown?.assessedCents ?? 0;
  const totalPaid = leader?.duesBreakdown?.paidCents ?? 0;
  const totalRemaining = totalAssessed - totalPaid;

  const updateMut = useMutation({
    mutationFn: () =>
      api.updateLeader(params!.id, {
        firstName: editFirstName,
        lastName: editLastName,
        position: editPosition || undefined,
        isActive: editActive,
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
      <Link href="/leaders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-pine">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Leaders
      </Link>

      <PageHeader
        title={`${leader.firstName} ${leader.lastName}`}
        description={leader.position ?? "Leader"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => {
              setEditFirstName(leader.firstName);
              setEditLastName(leader.lastName);
              setEditPosition(leader.position ?? "");
              setEditActive(leader.isActive);
              setShowEdit(true);
            }} title="Edit leader">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82H4.158l3.575-3.575L16.862 4.487Zm0 0L19.5 16.5" />
              </svg>
            </Button>
            <Button variant="ghost" onClick={() => setDeleteConfirm(true)} title="Delete leader">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </Button>
            <Button onClick={() => setShowAddTx(true)}>Record Transaction</Button>
          </div>
        }
      />

      {/* Dues summary from ledger transactions */}
      {leader && (totalAssessed > 0 || totalPaid > 0) && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Dues (All Cycles)</h3>
                <p className="text-xs text-muted">
                  Assessed: {formatMoney(totalAssessed)} · Paid: {formatMoney(totalPaid)} · Remaining: {formatMoney(totalRemaining)}
                </p>
              </div>
              <Link href="/dues">
                <Button variant="outline" size="sm">View Dues</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Balance"
          value={formatMoney(leader.balanceCents ?? 0)}
          tone={(leader.balanceCents ?? 0) < 0 ? "negative" : (leader.balanceCents ?? 0) > 0 ? "positive" : "default"}
          sub={(leader.balanceCents ?? 0) < 0 ? "Owes troop" : (leader.balanceCents ?? 0) > 0 ? "Troop owes leader" : "Even"}
        />
        <StatCard
          label="Status"
          value={leader.isActive ? "Active" : "Inactive"}
          tone={leader.isActive ? "positive" : "default"}
        />
      </div>

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
          {txType === "scout_deposit" && totalRemaining > 0 && (
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Active</span>
            <Switch checked={editActive} onChange={setEditActive} />
          </div>
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
