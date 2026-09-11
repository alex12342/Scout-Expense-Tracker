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

const REPORT_TYPES = [
  { value: "transactions", label: "Transaction Ledger" },
  { value: "scout-summary", label: "Scout Summary" },
  { value: "leader-summary", label: "Leader Summary" },
  { value: "event-summary", label: "Event Summary" },
  { value: "dues-summary", label: "Dues Summary" },
];

const TRANSACTION_TYPES = [
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
  { value: "dues_payment", label: "Dues Payment" },
  { value: "dues_refund", label: "Dues Refund" },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState("transactions");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [scoutId, setScoutId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [txType, setTxType] = useState("");
  const [isActive, setIsActive] = useState("");
  const [cycleId, setCycleId] = useState("");

  const { data: scouts } = useQuery({
    queryKey: ["scouts"],
    queryFn: () => api.listScouts(),
  });

  const { data: leaders } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => api.listLeaders(),
  });

  const { data: accounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listAccounts(),
  });

  const { data: cycles } = useQuery({
    queryKey: ["dues-cycles"],
    queryFn: () => api.listDuesCycles(),
  });

  const reportParams = {
    type: reportType,
    from: fromDate || undefined,
    to: toDate || undefined,
    scoutId: scoutId || undefined,
    leaderId: leaderId || undefined,
    bankAccountId: bankAccountId || undefined,
    transactionType: txType || undefined,
    isActive: isActive || undefined,
    cycleId: cycleId || undefined,
  };

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportParams],
    queryFn: () => api.getReport(reportParams),
    enabled: reportType !== "",
  });

  const exportCSV = () => {
    if (!report || !report.rows || report.rows.length === 0) return;
    const keys = Object.keys(report.rows[0]);
    const header = keys.join(",");
    const rows = report.rows.map((r) =>
      keys
        .map((k) => {
          const val = r[k];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(","),
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFilters = () => {
    switch (reportType) {
      case "transactions":
        return (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Select
              value={scoutId}
              onChange={(e) => setScoutId(e.target.value)}
              placeholder="All scouts"
              options={(scouts ?? []).map((s) => ({
                value: s.id,
                label: `${s.firstName} ${s.lastName}`,
              }))}
            />
            <Select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              placeholder="All leaders"
              options={(leaders ?? []).map((l) => ({
                value: l.id,
                label: `${l.firstName} ${l.lastName}`,
              }))}
            />
            <Select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              placeholder="All accounts"
              options={(accounts ?? []).map((a) => ({
                value: a.id,
                label: a.name,
              }))}
            />
            <Select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              placeholder="All types"
              options={TRANSACTION_TYPES}
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
        );
      case "scout-summary":
        return (
          <Select
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            placeholder="All scouts"
            options={[
              { value: "", label: "All scouts" },
              { value: "true", label: "Active only" },
              { value: "false", label: "Inactive only" },
            ]}
          />
        );
      case "leader-summary":
        return (
          <Select
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            placeholder="All leaders"
            options={[
              { value: "", label: "All leaders" },
              { value: "true", label: "Active only" },
              { value: "false", label: "Inactive only" },
            ]}
          />
        );
      case "event-summary":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
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
        );
      case "dues-summary":
        return (
          <Select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            placeholder="All cycles"
            options={[
              { value: "", label: "All cycles" },
              ...(cycles ?? []).map((c) => ({
                value: c.id,
                label: `${c.label}${c.isCurrent ? " (current)" : ""}`,
              })),
            ]}
          />
        );
      default:
        return null;
    }
  };

  const renderHeaders = () => {
    switch (reportType) {
      case "transactions":
        return (
          <TableRow>
            <TableHeader>Date</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader>Account</TableHeader>
            <TableHeader>Description</TableHeader>
            <TableHeader className="text-right">Amount</TableHeader>
          </TableRow>
        );
      case "scout-summary":
        return (
          <TableRow>
            <TableHeader>Scout</TableHeader>
            <TableHeader>Rank</TableHeader>
            <TableHeader>BSA #</TableHeader>
            <TableHeader>Deposits</TableHeader>
            <TableHeader>Payments</TableHeader>
            <TableHeader>Allocations</TableHeader>
            <TableHeader className="text-right">Balance</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        );
      case "leader-summary":
        return (
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Position</TableHeader>
            <TableHeader>Deposits</TableHeader>
            <TableHeader>Payments</TableHeader>
            <TableHeader>Allocations</TableHeader>
            <TableHeader className="text-right">Balance</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        );
      case "event-summary":
        return (
          <TableRow>
            <TableHeader>Event</TableHeader>
            <TableHeader>Date</TableHeader>
            <TableHeader>Cost</TableHeader>
            <TableHeader>Paid</TableHeader>
            <TableHeader className="text-right">Outstanding</TableHeader>
            <TableHeader className="text-right">Participants</TableHeader>
          </TableRow>
        );
      case "dues-summary":
        return (
          <TableRow>
            <TableHeader>Cycle</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Members</TableHeader>
            <TableHeader className="text-right">Due</TableHeader>
            <TableHeader className="text-right">Paid</TableHeader>
            <TableHeader className="text-right">Outstanding</TableHeader>
            <TableHeader className="text-right">Progress</TableHeader>
          </TableRow>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generate and export custom reports"
        actions={
          report && (report.rows?.length ?? 0) > 0 ? (
            <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
          ) : undefined
        }
      />

      {/* Report type selector */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {REPORT_TYPES.map((rt) => (
              <Button
                key={rt.value}
                variant={reportType === rt.value ? "primary" : "outline"}
                onClick={() => setReportType(rt.value)}
              >
                {rt.label}
              </Button>
            ))}
          </div>

          {/* Filters */}
          {reportType && renderFilters()}
        </CardContent>
      </Card>

      {/* Report results */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-pine" />
        </div>
      ) : report?.rows && report.rows.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-xs text-muted">{report.totalRows} rows</p>
            <Table>
              <TableHead>{renderHeaders()}</TableHead>
              <TableBody>
                {(() => {
                  const rows = (report.rows ?? []) as Record<string, unknown>[];
                  switch (reportType) {
                    case "transactions": {
                      const txRows = rows as Array<{
                        id: string;
                        occurredAt: string;
                        type: string;
                        amountCents: number;
                        scoutName: string | null;
                        leaderName: string | null;
                        bankAccountName: string | null;
                        description: string | null;
                      }>;
                      return txRows.map((tx) => (
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
                          <TableCell className="text-ink">
                            {tx.scoutName ?? tx.leaderName ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted">{tx.bankAccountName ?? "—"}</TableCell>
                          <TableCell className="text-muted">{tx.description ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={tx.amountCents > 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(tx.amountCents, { sign: true })}
                            </span>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "scout-summary": {
                      const scoutRows = rows as Array<{
                        scoutId: string;
                        name: string;
                        firstName: string;
                        lastName: string;
                        rank: string | null;
                        bsaNumber: string | null;
                        balanceCents: number;
                        totalDepositsCents: number;
                        totalEventPaymentsCents: number;
                        totalEventAllocationsCents: number;
                        isActive: boolean;
                      }>;
                      return scoutRows.map((s) => (
                        <TableRow key={s.scoutId}>
                          <TableCell className="font-medium text-ink">
                            {s.firstName} {s.lastName}
                          </TableCell>
                          <TableCell className="text-muted">{s.rank ?? "—"}</TableCell>
                          <TableCell className="font-mono text-muted">{s.bsaNumber ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(s.totalDepositsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(s.totalEventPaymentsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-ember">
                            {formatMoney(s.totalEventAllocationsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={s.balanceCents >= 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(s.balanceCents)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.isActive ? "success" : "muted"}>
                              {s.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "leader-summary": {
                      const leaderRows = rows as Array<{
                        leaderId: string;
                        name: string;
                        firstName: string;
                        lastName: string;
                        position: string | null;
                        balanceCents: number;
                        totalDepositsCents: number;
                        totalEventPaymentsCents: number;
                        totalEventAllocationsCents: number;
                        isActive: boolean;
                      }>;
                      return leaderRows.map((l) => (
                        <TableRow key={l.leaderId}>
                          <TableCell className="font-medium text-ink">
                            {l.firstName} {l.lastName}
                          </TableCell>
                          <TableCell className="text-muted">{l.position ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(l.totalDepositsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(l.totalEventPaymentsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-ember">
                            {formatMoney(l.totalEventAllocationsCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={l.balanceCents >= 0 ? "text-moss" : "text-ember"}>
                              {formatMoney(l.balanceCents)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.isActive ? "success" : "muted"}>
                              {l.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    case "event-summary": {
                      const eventRows = rows as Array<{
                        eventId: string;
                        name: string;
                        eventDate: string;
                        description: string | null;
                        totalCostCents: number;
                        totalPaidCents: number;
                        outstandingCents: number;
                        participantCount: number;
                      }>;
                      return eventRows.map((e) => (
                        <TableRow key={e.eventId}>
                          <TableCell className="font-medium text-ink">{e.name}</TableCell>
                          <TableCell className="text-muted">
                            {new Date(e.eventDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {formatMoney(e.totalCostCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(e.totalPaidCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={e.outstandingCents > 0 ? "text-ember" : "text-moss"}>
                              {formatMoney(e.outstandingCents)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">{e.participantCount}</TableCell>
                        </TableRow>
                      ));
                    }
                    case "dues-summary": {
                      const duesRows = rows as Array<{
                        cycleId: string;
                        label: string;
                        isCurrent: boolean;
                        totalDueCents: number;
                        totalPaidCents: number;
                        outstandingCents: number;
                        memberCount: number;
                        paidCount: number;
                      }>;
                      return duesRows.map((d) => (
                        <TableRow key={d.cycleId}>
                          <TableCell className="font-medium text-ink">{d.label}</TableCell>
                          <TableCell>
                            <Badge variant={d.isCurrent ? "success" : "muted"}>
                              {d.isCurrent ? "Current" : "Past"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{d.paidCount}/{d.memberCount}</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {formatMoney(d.totalDueCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum text-moss">
                            {formatMoney(d.totalPaidCents)}
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            <span className={d.outstandingCents > 0 ? "text-ember" : "text-moss"}>
                              {formatMoney(d.outstandingCents)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {d.memberCount > 0
                              ? `${Math.round((d.paidCount / d.memberCount) * 100)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ));
                    }
                  }
                  return null;
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : reportType ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No data matches your report type.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
