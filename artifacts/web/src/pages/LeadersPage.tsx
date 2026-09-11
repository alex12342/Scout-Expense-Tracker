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

export default function LeadersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");

  const { data: leaders, isLoading } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => api.listLeaders(),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createLeader({
        firstName,
        lastName,
        position: position || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      toast("Leader added", "success");
      setShowAdd(false);
      setFirstName("");
      setLastName("");
      setPosition("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteLeader(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      toast("Leader removed", "success");
      setDeleteId(null);
    },
    onError: (err) => toast(err.message, "error"),
  });

  return (
    <div>
      <PageHeader
        title="Leaders"
        description={`${leaders?.length ?? 0} registered`}
        actions={
          <Button onClick={() => setShowAdd(true)}>Add Leader</Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-pine" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4">
            {!leaders || leaders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No leaders yet. Add your first leader.
              </p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Position</TableHeader>
                    <TableHeader className="text-right">Balance</TableHeader>
                    <TableHeader className="text-right">Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaders.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/leaders/${l.id}`} className="font-medium text-ink hover:text-pine">
                          {l.firstName} {l.lastName}
                        </Link>
                        {!l.isActive && <Badge variant="muted" className="ml-2">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-muted">{l.position ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm tnum ${
                            (l.balanceCents ?? 0) < 0
                              ? "text-ember"
                              : (l.balanceCents ?? 0) > 0
                                ? "text-moss"
                                : "text-ink"
                          }`}
                        >
                          {formatMoney(l.balanceCents ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => setDeleteId(l.id)}
                          className="rounded-lg p-1.5 text-muted hover:bg-ember-soft hover:text-ember"
                          title="Delete leader"
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

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add Leader" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jake"
              autoFocus
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Morrison"
            />
          </div>
          <Select
            label="Position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Select position (optional)"
            options={[
              { value: "", label: "Select position" },
              ...LEADER_POSITIONS.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!firstName.trim() || createMut.isPending}>
            {createMut.isPending ? "Adding…" : "Add Leader"}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Leader"
        description="This will remove the leader and all their financial records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  );
}
