import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "../lib/api";
import { formatMoney, parseMoney } from "../lib/money";
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
  useToast,
} from "../components/ui";

export default function BankAccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [last4, setLast4] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const opening = openingBalance ? parseMoney(openingBalance) : undefined;
      if (opening !== undefined && opening === null) throw new Error("Invalid balance");
      return api.createAccount({
        name,
        accountType,
        last4: last4 || undefined,
        openingBalance: opening !== undefined ? opening / 100 : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Account created", "success");
      setShowAdd(false);
      setName("");
      setLast4("");
      setOpeningBalance("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Account deleted", "success");
      setDeleteId(null);
    },
    onError: (err) => toast(err.message, "error"),
  });

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        description={`${accounts?.length ?? 0} accounts`}
        actions={<Button onClick={() => setShowAdd(true)}>Add Account</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>
      ) : !accounts || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No bank accounts yet. Add your troop's checking or savings account.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((acc) => (
            <Card key={acc.id} className="group relative">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-ink">{acc.name}</h3>
                      <Badge variant={acc.accountType === "checking" ? "default" : "success"}>
                        {acc.accountType}
                      </Badge>
                    </div>
                    {acc.last4 && <p className="mt-0.5 text-xs text-muted">•••• {acc.last4}</p>}
                  </div>
                  <button
                    onClick={() => setDeleteId(acc.id)}
                    className="rounded-lg p-1.5 text-muted opacity-0 transition-opacity hover:bg-ember-soft hover:text-ember group-hover:opacity-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
                <p className="mt-4 font-mono text-2xl font-semibold tnum text-ink">
                  {formatMoney(acc.balanceCents ?? 0)}
                </p>
                <Link
                  href={`/bank-accounts/${acc.id}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-pine hover:underline"
                >
                  View transactions
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add Bank Account" size="sm">
        <div className="space-y-4">
          <Input
            label="Account Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Troop Checking"
            autoFocus
          />
          <Select
            label="Type"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "checking" | "savings")}
            options={[
              { value: "checking", label: "Checking" },
              { value: "savings", label: "Savings" },
            ]}
          />
          <Input
            label="Last 4 Digits"
            value={last4}
            onChange={(e) => setLast4(e.target.value)}
            placeholder="e.g., 4829"
            maxLength={4}
          />
          <Input
            label="Opening Balance ($)"
            type="number"
            step="0.01"
            min="0"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="0.00 (optional)"
            prefix="$"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
            {createMut.isPending ? "Creating…" : "Create Account"}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Account"
        description="This will remove the account and all its transactions. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  );
}
