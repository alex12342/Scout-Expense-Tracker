import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatMoney, formatDateTime } from "../lib/money";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
} from "../components/ui";

const typeOptions = [
  { value: "", label: "All types" },
  { value: "opening_balance", label: "Opening Balance" },
  { value: "scout_deposit", label: "Scout Deposit" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "event_allocation", label: "Event Allocation" },
  { value: "event_payment", label: "Event Payment" },
  { value: "event_refund", label: "Event Refund" },
  { value: "bank_expense", label: "Bank Expense" },
  { value: "bank_adjustment", label: "Bank Adjustment" },
  { value: "scout_adjustment", label: "Scout Adjustment" },
];

export default function LedgerPage() {
  const [scoutFilter, setScoutFilter] = useState("");
  const [leaderFilter, setLeaderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
                        {tx.type.replace(/_/g, " ")}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
