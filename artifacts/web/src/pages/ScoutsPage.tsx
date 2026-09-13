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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "../components/ui";

export default function ScoutsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Add form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bsaNumber, setBsaNumber] = useState("");
  const [rank, setRank] = useState("");
  const [age, setAge] = useState("");

  // Edit form state
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBsaNumber, setEditBsaNumber] = useState("");
  const [editRank, setEditRank] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editActive, setEditActive] = useState(false);

  const { data: scouts, isLoading } = useQuery({
    queryKey: ["scouts"],
    queryFn: () => api.listScouts(),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createScout({
        firstName,
        lastName,
        bsaNumber: bsaNumber || undefined,
        rank: rank || undefined,
        age: age ? parseInt(age, 10) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Scout added", "success");
      setShowAdd(false);
      setFirstName("");
      setLastName("");
      setBsaNumber("");
      setRank("");
      setAge("");
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

  const updateMut = useMutation({
    mutationFn: (body: {
      firstName: string;
      lastName?: string;
      bsaNumber?: string;
      rank?: string;
      age?: number | null;
      isActive?: boolean;
    }) => api.updateScout(editId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Scout updated", "success");
      setShowEdit(false);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const openEdit = (s: { id: string; firstName: string; lastName?: string | null; bsaNumber?: string | null; rank?: string | null; age?: number | null; isActive: boolean }) => {
    setEditId(s.id);
    setEditFirstName(s.firstName);
    setEditLastName(s.lastName ?? "");
    setEditBsaNumber(s.bsaNumber ?? "");
    setEditRank(s.rank ?? "");
    setEditAge(s.age?.toString() ?? "");
    setEditActive(s.isActive);
    setShowEdit(true);
  };

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
                    <TableHeader>Age</TableHeader>
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
                      <TableCell className="text-muted">{s.age ?? "—"}</TableCell>
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
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(s)}
                            className="rounded-lg p-1.5 text-muted hover:bg-pine-soft hover:text-pine"
                            title="Edit scout"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82H4.158l3.575-3.575L16.862 4.487Zm0 0L19.5 16.5" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(s.id)}
                            className="rounded-lg p-1.5 text-muted hover:bg-ember-soft hover:text-ember"
                            title="Delete scout"
                          >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                          </button>
                        </div>
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
          <Input
            label="Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g., 14"
            type="number"
            min="0"
            max="120"
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
          <Button onClick={() => createMut.mutate()} disabled={!firstName.trim() || createMut.isPending}>
            {createMut.isPending ? "Adding…" : "Add Scout"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Scout Dialog */}
      <Dialog open={showEdit} onClose={() => setShowEdit(false)} title="Edit Scout" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              placeholder="Jake"
              autoFocus
            />
            <Input
              label="Last Name"
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              placeholder="Morrison"
            />
          </div>
          <Input
            label="Age"
            value={editAge}
            onChange={(e) => setEditAge(e.target.value)}
            placeholder="e.g., 14"
            type="number"
            min="0"
            max="120"
          />
          <Input
            label="BSA Number"
            value={editBsaNumber}
            onChange={(e) => setEditBsaNumber(e.target.value)}
            placeholder="e.g., 2847561"
          />
          <Select
            label="Rank"
            value={editRank}
            onChange={(e) => setEditRank(e.target.value)}
            placeholder="Select rank (optional)"
            options={[
              { value: "", label: "Select rank" },
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Active</span>
            <Switch checked={editActive} onChange={setEditActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
          <Button onClick={() => updateMut.mutate({
            firstName: editFirstName,
            lastName: editLastName || undefined,
            bsaNumber: editBsaNumber || undefined,
            rank: editRank || undefined,
            age: editAge ? parseInt(editAge, 10) : null,
            isActive: editActive,
          })} disabled={!editFirstName.trim() || updateMut.isPending}>
            {updateMut.isPending ? "Saving…" : "Save"}
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
