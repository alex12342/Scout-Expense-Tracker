import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "../lib/api";
import { formatMoney, evenSplit } from "../lib/money";
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
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  Textarea,
  useToast,
} from "../components/ui";

export default function EventsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScouts, setSelectedScouts] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [lineItems, setLineItems] = useState<Array<{ name: string; amountCents: number; participantTypes: string[] }>>([
    { name: "", amountCents: 0, participantTypes: ["everyone"] },
  ]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.listEvents(),
  });

  const { data: scouts } = useQuery({
    queryKey: ["scouts"],
    queryFn: () => api.listScouts(),
  });

  const toggleScout = (id: string) => {
    setSelectedScouts((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const updateAllocation = (scoutId: string, val: string) => {
    setAllocations((prev) => ({ ...prev, [scoutId]: val }));
  };

  const createMut = useMutation({
    mutationFn: () => {
      const validLineItems = lineItems.filter((item) => item.name.trim() && item.amountCents > 0);
      if (validLineItems.length === 0) throw new Error("Add at least one valid line item");
      const participants = selectedScouts.map((sid) => {
        const allocStr = allocations[sid];
        return {
          scoutId: sid,
          amountAllocatedCents: allocStr ? parseFloat(allocStr) : undefined,
        };
      });
      return api.createEvent({
        name,
        eventDate,
        description: description || undefined,
        lineItems: validLineItems,
        participants,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Event created", "success");
      setShowCreate(false);
      setName("");
      setEventDate("");
      setDescription("");
      setSelectedScouts([]);
      setAllocations({});
      setLineItems([{ name: "", amountCents: 0, participantTypes: ["everyone"] }]);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Event deleted", "success");
      setDeleteId(null);
    },
    onError: (err) => toast(err.message, "error"),
  });

  return (
    <div>
      <PageHeader
        title="Events"
        description={`${events?.length ?? 0} events tracked`}
        actions={<Button onClick={() => setShowCreate(true)}>Create Event</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-pine" /></div>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No events yet. Create an event to start tracking cost splits.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Event</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader className="text-right">Estimated</TableHeader>
                  <TableHeader className="text-right">Actual</TableHeader>
                  <TableHeader className="text-right">Participants</TableHeader>
                  <TableHeader className="text-right">Outstanding</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <Link href={`/events/${ev.id}`} className="font-medium text-ink hover:text-pine">
                        {ev.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">
                      {new Date(ev.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right font-mono tnum">
                      {formatMoney((ev as { estimatedTotalCents?: number }).estimatedTotalCents ?? ev.totalCostCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono tnum">
                      {formatMoney(ev.totalCostCents)}
                    </TableCell>
                    <TableCell className="text-right">{ev.participantCount ?? 0}</TableCell>
                    <TableCell className="text-right font-mono tnum">
                      <span className={(ev.outstandingCents ?? 0) > 0 ? "text-ember" : "text-moss"}>
                        {formatMoney(ev.outstandingCents ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(ev.outstandingCents ?? 0) === 0 ? (
                        <Badge variant="success">Paid</Badge>
                      ) : (ev.totalPaidCents ?? 0) > 0 ? (
                        <Badge variant="warning">Partial</Badge>
                      ) : (
                        <Badge variant="destructive">Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => setDeleteId(ev.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-ember-soft hover:text-ember"
                        title="Delete event"
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
          </CardContent>
        </Card>
      )}

      {/* Create Event Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Create Event" size="lg">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Event Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Summer Camp" autoFocus />
            <Input label="Date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" rows={2} />

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink-soft">Cost Items</p>
              <Button variant="ghost" size="sm" onClick={() => setLineItems([...lineItems, { name: "", amountCents: 0, participantTypes: ["everyone"] }])}>
                + Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={item.name}
                    onChange={(e) => setLineItems(lineItems.map((it, j) => j === i ? { ...it, name: e.target.value } : it))}
                    placeholder="Item name"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.amountCents || ""}
                    onChange={(e) => setLineItems(lineItems.map((it, j) => j === i ? { ...it, amountCents: parseFloat(e.target.value) || 0 } : it))}
                    placeholder="0.00"
                    prefix="$"
                    className="w-32"
                  />
                  <div className="flex gap-1">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.participantTypes.includes("scout")}
                        onChange={(e) => {
                          const types = e.target.checked
                            ? [...new Set([...item.participantTypes, "scout"])]
                            : item.participantTypes.filter((t) => t !== "scout");
                          setLineItems(lineItems.map((it, j) => j === i ? { ...it, participantTypes: types } : it));
                        }}
                        className="h-3 w-3"
                      />
                      Scouts
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.participantTypes.includes("leader")}
                        onChange={(e) => {
                          const types = e.target.checked
                            ? [...new Set([...item.participantTypes, "leader"])]
                            : item.participantTypes.filter((t) => t !== "leader");
                          setLineItems(lineItems.map((it, j) => j === i ? { ...it, participantTypes: types } : it));
                        }}
                        className="h-3 w-3"
                      />
                      Leaders
                    </label>
                  </div>
                  <button
                    onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))}
                    className="text-ember hover:text-ember/80"
                    disabled={lineItems.length <= 1}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Total: {formatMoney(lineItems.reduce((s, item) => s + item.amountCents, 0))}
            </p>
          </div>

          {/* Scout picker */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink-soft">Participants</p>
            {!scouts || scouts.length === 0 ? (
              <p className="text-sm text-muted">No scouts registered yet.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {scouts.filter((s) => s.isActive).map((s) => {
                  const isSel = selectedScouts.includes(s.id);
                  const totalAmount = lineItems.reduce((s, item) => s + item.amountCents, 0);
                  const defaultSplit = totalAmount && selectedScouts.length > 0
                    ? formatMoney(Math.round((totalAmount * 100) / selectedScouts.length))
                    : null;
                  return (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-pine-soft/30">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleScout(s.id)}
                        className="h-4 w-4 rounded border-line text-pine focus:ring-pine"
                      />
                      <span className={`flex-1 text-sm ${isSel ? "font-medium text-ink" : "text-muted"}`}>
                        {s.name}
                      </span>
                      {isSel && (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={defaultSplit ? defaultSplit.replace("$", "") : "auto"}
                          value={allocations[s.id] ?? ""}
                          onChange={(e) => updateAllocation(s.id, e.target.value)}
                          className="h-7 w-24 rounded border border-line bg-surface px-2 text-right font-mono text-xs tnum"
                          title="Override split amount (leave blank for even split)"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedScouts.length > 0 && lineItems.some((item) => item.amountCents > 0) && (
              <p className="mt-1 text-xs text-muted">
                Even split: {formatMoney(Math.round((lineItems.reduce((s, item) => s + item.amountCents, 0) * 100) / selectedScouts.length))} each
                ({selectedScouts.length} scouts)
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!name.trim() || !eventDate || lineItems.filter((i) => i.amountCents > 0).length === 0 || selectedScouts.length === 0 || createMut.isPending}
          >
            {createMut.isPending ? "Creating…" : "Create Event"}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Event"
        description="This will remove the event, its participants, and all related transactions. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  );
}
