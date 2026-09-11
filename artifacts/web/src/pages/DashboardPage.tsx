import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import {
  Card,
  CardContent,
  PageHeader,
  StatCard,
  Badge,
  Spinner,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
  TableHead,
} from "../components/ui";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6 text-pine" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-ember">Failed to load dashboard.</p>;
  }

  const { totals } = data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Troop financial overview at a glance"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Bank Total"
          value={formatMoney(totals.bankTotalCents)}
          sub="All accounts"
        />
        <StatCard
          label="Scouts Owed"
          value={formatMoney(-totals.scoutDebtCents)}
          tone={totals.scoutDebtCents > 0 ? "negative" : "default"}
          sub={`${data.scouts.filter((s) => (s.balanceCents ?? 0) < 0).length} scouts owing`}
        />
        <StatCard
          label="Leaders Owed"
          value={formatMoney(-totals.leaderDebtCents)}
          tone={(totals.leaderDebtCents ?? 0) > 0 ? "negative" : "default"}
          sub={`${(data.leaders ?? []).filter((l) => (l.balanceCents ?? 0) < 0).length} leaders owing`}
        />
        <StatCard
          label="Scouts Credit"
          value={formatMoney(totals.scoutCreditCents)}
          tone={totals.scoutCreditCents > 0 ? "positive" : "default"}
          sub="Troop owes scouts"
        />
        <StatCard
          label="Events Outstanding"
          value={formatMoney(totals.eventsOutstandingCents)}
          tone={totals.eventsOutstandingCents > 0 ? "warning" : "default"}
          sub="Unpaid event splits"
        />
        <StatCard
          label="Total Owed"
          value={formatMoney(totals.totalOwedToTroopCents)}
          tone={totals.totalOwedToTroopCents > 0 ? "negative" : "default"}
          sub="Scouts + leaders + events + dues"
        />
      </div>

      {/* Two column layout */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Bank Accounts */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Bank Accounts</h2>
            {data.accounts.length === 0 ? (
              <p className="text-sm text-muted">No bank accounts yet.</p>
            ) : (
              <div className="space-y-2">
                {data.accounts.map((acc) => (
                  <Link
                    key={acc.id}
                    href={`/bank-accounts/${acc.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-pine-soft/40"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={acc.accountType === "checking" ? "default" : "success"}>
                        {acc.accountType}
                      </Badge>
                      <span className="text-sm text-ink">{acc.name}</span>
                    </div>
                    <span className="font-mono text-sm font-medium tnum text-ink">
                      {formatMoney(acc.balanceCents ?? 0)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Events */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Open Events</h2>
            {data.events.length === 0 ? (
              <p className="text-sm text-muted">No events tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {data.events.slice(0, 5).map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/events/${ev.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-pine-soft/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{ev.name}</p>
                      <p className="text-xs text-muted">
                        {new Date(ev.eventDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tnum text-ink">
                        {formatMoney(ev.totalCostCents)}
                      </p>
                      {(ev.outstandingCents ?? 0) > 0 ? (
                        <Badge variant="warning" className="mt-0.5">
                          {formatMoney(ev.outstandingCents ?? 0)} owed
                        </Badge>
                      ) : (
                        <Badge variant="success" className="mt-0.5">
                          Paid
                        </Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scouts with balances */}
      <Card className="mt-6">
        <CardContent className="pt-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Scout Balances</h2>
          {data.scouts.length === 0 ? (
            <p className="text-sm text-muted">No scouts registered yet.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Scout</TableHeader>
                  <TableHeader>Rank</TableHeader>
                  <TableHeader className="text-right">Balance</TableHeader>
                  <TableHeader className="text-right">Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.scouts.map((scout) => (
                  <TableRow key={scout.id}>
                    <TableCell>
                      <Link href={`/scouts/${scout.id}`} className="font-medium text-ink hover:text-pine">
                        {scout.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">{scout.rank ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tnum">
                      {formatMoney(scout.balanceCents ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(scout.balanceCents ?? 0) < 0 ? (
                        <Badge variant="destructive">Owes</Badge>
                      ) : (scout.balanceCents ?? 0) > 0 ? (
                        <Badge variant="success">Credit</Badge>
                      ) : (
                        <Badge variant="muted">Even</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Leaders with balances */}
      {(data.leaders?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Leader Balances</h2>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Position</TableHeader>
                  <TableHeader className="text-right">Balance</TableHeader>
                  <TableHeader className="text-right">Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.leaders!.map((leader) => (
                  <TableRow key={leader.id}>
                    <TableCell>
                      <Link href={`/leaders/${leader.id}`} className="font-medium text-ink hover:text-pine">
                        {leader.firstName} {leader.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">{leader.position ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tnum">
                      {formatMoney(leader.balanceCents ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(leader.balanceCents ?? 0) < 0 ? (
                        <Badge variant="destructive">Owes</Badge>
                      ) : (leader.balanceCents ?? 0) > 0 ? (
                        <Badge variant="success">Credit</Badge>
                      ) : (
                        <Badge variant="muted">Even</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dues Summary */}
      {(data.dues.assessedCents ?? 0) > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Dues Summary (All Cycles)</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted">Assessed</p>
                <p className="font-mono text-lg font-medium tnum text-ink">
                  {formatMoney(data.dues.assessedCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Paid</p>
                <p className="font-mono text-lg font-medium tnum text-moss">
                  {formatMoney(data.dues.paidCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Outstanding</p>
                <p className="font-mono text-lg font-medium tnum text-ember">
                  {formatMoney(data.dues.outstandingCents)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
