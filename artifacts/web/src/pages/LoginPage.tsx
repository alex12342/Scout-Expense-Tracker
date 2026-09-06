import { useState } from "react";
import { Link } from "wouter";
import { Button, Input, useToast } from "../components/ui";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      toast("Welcome back!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="paper flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pine shadow-lift">
            <svg className="h-7 w-7 text-canvas" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Trailhead Ledger</h1>
          <p className="mt-1 text-sm text-muted">Troop finances, tracked with care.</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-ember">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Self-hosted · No external services · Your data stays local
        </p>
      </div>
    </div>
  );
}
