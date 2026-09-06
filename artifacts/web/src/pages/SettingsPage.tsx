import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogFooter,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  useToast,
} from "../components/ui";

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // User management
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "leader">("leader");
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
    enabled: isAdmin,
  });

  const changePwMut = useMutation({
    mutationFn: () => api.changePassword(currentPw, newPw),
    onSuccess: () => {
      toast("Password changed", "success");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const createUserMut = useMutation({
    mutationFn: () =>
      api.createUser({
        username: newUsername,
        displayName: newDisplayName,
        password: newPassword,
        role: newRole,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast("User created", "success");
      setShowAddUser(false);
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setNewRole("leader");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteUserMut = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast("User removed", "success");
      setDeleteUserId(null);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (id: string) =>
      api.updateUser(id, { isActive: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast("User deactivated", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast("Passwords don't match", "error");
      return;
    }
    if (newPw.length < 8) {
      toast("Password must be at least 8 characters", "error");
      return;
    }
    changePwMut.mutate();
  };

  return (
    <div>
      <PageHeader title="Settings" description="Account and troop preferences" />

      <div className="space-y-6">
        {/* Change Password */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-4 font-display text-sm font-semibold text-ink">Change Password</h2>
            <form onSubmit={handlePasswordSubmit} className="max-w-sm space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
              />
              <Input
                label="New Password"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
              <Button type="submit" disabled={changePwMut.isPending}>
                {changePwMut.isPending ? "Changing…" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* User Management (admin only) */}
        {isAdmin && (
          <Card>
            <CardContent className="pt-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-ink">Team Members</h2>
                <Button size="sm" onClick={() => setShowAddUser(true)}>Add User</Button>
              </div>
              {users && users.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Username</TableHeader>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Role</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader className="text-right">Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-sm">{u.username}</TableCell>
                        <TableCell>{u.displayName}</TableCell>
                        <TableCell>
                          <span className={`text-sm ${u.role === "admin" ? "font-medium text-ink" : "text-muted"}`}>
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm ${u.isActive ? "text-moss" : "text-muted"}`}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {u.id !== user?.id && (
                            <button
                              onClick={() => setDeleteUserId(u.id)}
                              className="rounded-lg p-1.5 text-muted hover:bg-ember-soft hover:text-ember"
                              title="Remove user"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted">No users found.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* App Info */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-2 font-display text-sm font-semibold text-ink">About</h2>
            <div className="space-y-1 text-sm text-muted">
              <p>Trailhead Ledger v0.1.0</p>
              <p>Self-hosted troop finance tracker</p>
              <p>Single-container deployment · PostgreSQL · No external services</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onClose={() => setShowAddUser(false)} title="Add Team Member" size="sm">
        <div className="space-y-4">
          <Input label="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g., jsmith" autoFocus />
          <Input label="Display Name" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="e.g., John Smith" />
          <Input label="Temporary Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} />
          <Select
            label="Role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "leader")}
            options={[
              { value: "leader", label: "Leader (can manage data)" },
              { value: "admin", label: "Admin (full access)" },
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowAddUser(false)}>Cancel</Button>
          <Button
            onClick={() => createUserMut.mutate()}
            disabled={!newUsername.trim() || !newDisplayName.trim() || newPassword.length < 8 || createUserMut.isPending}
          >
            {createUserMut.isPending ? "Creating…" : "Add User"}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleteUserId !== null}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => deleteUserId && deleteUserMut.mutate(deleteUserId)}
        title="Remove User"
        description="This will remove the user's access. Their past actions remain in the ledger."
        confirmLabel="Remove"
        destructive
        loading={deleteUserMut.isPending}
      />
    </div>
  );
}
