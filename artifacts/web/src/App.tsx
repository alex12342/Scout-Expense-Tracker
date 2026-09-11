import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { useAuth } from "./lib/auth";
import AppShell from "./components/AppShell";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ScoutsPage from "./pages/ScoutsPage";
import ScoutDetailPage from "./pages/ScoutDetailPage";
import LeadersPage from "./pages/LeadersPage";
import LeaderDetailPage from "./pages/LeaderDetailPage";
import DuesPage from "./pages/DuesPage";
import BankAccountsPage from "./pages/BankAccountsPage";
import BankAccountDetailPage from "./pages/BankAccountDetailPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import LedgerPage from "./pages/LedgerPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-pine" />
    </div>
  );
}

function RedirectNote({ text, to }: { text: string; to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return (
    <div className="flex flex-col items-center gap-3 text-muted">
      <Spinner className="h-6 w-6 text-pine" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;

  if (!user) {
    return (
      <Switch>
        <Route path="/login">
          <LoginPage />
        </Route>
        <Route>
          <RedirectNote text="Please sign in to continue." to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        <RedirectNote text="You are signed in — taking you to the dashboard." to="/" />
      </Route>
      <Route>
        <AppShell>
          <Switch>
            <Route path="/scouts">
              <ScoutsPage />
            </Route>
            <Route path="/scouts/:id">
              <ScoutDetailPage />
            </Route>
            <Route path="/leaders">
              <LeadersPage />
            </Route>
            <Route path="/leaders/:id">
              <LeaderDetailPage />
            </Route>
            <Route path="/dues">
              <DuesPage />
            </Route>
            <Route path="/bank-accounts">
              <BankAccountsPage />
            </Route>
            <Route path="/bank-accounts/:id">
              <BankAccountDetailPage />
            </Route>
            <Route path="/events">
              <EventsPage />
            </Route>
            <Route path="/events/:id">
              <EventDetailPage />
            </Route>
            <Route path="/ledger">
              <LedgerPage />
            </Route>
            <Route path="/reports">
              <ReportsPage />
            </Route>
            <Route path="/settings">
              <SettingsPage />
            </Route>
            <Route>
              <DashboardPage />
            </Route>
          </Switch>
        </AppShell>
      </Route>
    </Switch>
  );
}
