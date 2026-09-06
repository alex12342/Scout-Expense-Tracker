import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
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
  TableHeader,
  TableHead,
  TableCell,
  TableRow,
  useToast,
} from "../components/ui";

export default function ScoutsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [bsaNumber, setBsaNumber] = useState("");
  const [rank, setRank] = useState("");

  const { data: scouts, isLoading } = useQuery({
    queryKey: ["scouts"],
    queryFn: () => api.listScouts(),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createScout({
        name,
        bsaNumber: bsaNumber || undefined,
        rank: rank || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Scout added", "success");
      setShowAdd(false);
      setName("");
      setBsaNumber("");
      setRank("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteScout(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Scout removed", "success");
      setDeleteId(null);
    },
    onError: (err) => toast(err.message, "error"),
  });

  return (
    <div>
      <PageHeader
        title="Scouts"
        description={`${scouts?.length ?? 0} registered`}
        actions={
          <Button onClick={() => setShowAdd(true)}>Add Scout</Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-pine" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4">
            {!scouts || scouts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No scouts yet. Add your first scout to get started.
              </p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Rank</TableHeader>
                    <TableHeader>BSA #</TableHeader>
                    <TableHeader className="text-right">Balance</TableHeader>
                    <TableHeader className="text-right">Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scouts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/scouts/${s.id}`} className="font-medium text-ink hover:text-pine">
                          {s.name}
                        </Link>
                        {!s.isActive && <Badge variant="muted" className="ml-2">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-muted">{s.rank ?? "—"}</TableCell>
                      <TableCell className="text-muted">{s.bsaNumber ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm tnum ${
                            (s.balanceCents ?? 0) < 0
                              ? "text-ember"
                              : (s.balanceCents ?? 0) > 0
                                ? "text-moss"
                                : "text-ink"
                          }`}
                        >
                          {formatMoney(s.balanceCents ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => setDeleteId(s.id)}
                          className="rounded-lg p-1.5 text-muted hover:bg-ember-soft hover:text-ember"
                          title="Delete scout"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Scout Dialog */}
      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add Scout" size="sm">
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Jake Morrison"
            autoFocus
          />
          <Input
            label="BSA Number"
            value={bsaNumber}
            onChange={(e) => setBsaNumber(e.target.value)}
            placeholder="e.g., 2847561"
          />
          <Select
            label="Rank"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            placeholder="Select rank (optional)"
            options={[
              { value: "Cub", label: "Cub" },
              { value: "Scout", label: "Scout" },
              { value: "Tenderfoot", label: "Tenderfoot" },
              { value: "Second Class", label: "Second Class" },
              { value: "First Class", label: "First Class" },
              { value: "Star", label: "Star" },
              { value: "Life", label: "Life" },
              { value: "Eagle", label: "Eagle" },
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
            {createMut.isPending ? "Adding…" : "Add Scout"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Scout"
        description="This will remove the scout and all their ledger entries. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  );
}
