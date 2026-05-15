import { useEffect, useState } from "react";

import { ImportPanel } from "./components/import/import-panel";
import { PlanningWorkspace } from "./components/planning/planning-workspace";
import { SavingsWorkspace } from "./components/savings/savings-workspace";
import { TransactionWorkspace } from "./components/transactions/transaction-workspace";
import { HealthCard } from "./components/health-card";
import { fetchHealth, HttpError, type HealthResponse } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchHealth();
      setHealth(response);
    } catch (caughtError) {
      if (caughtError instanceof HttpError) {
        setError(`${caughtError.payload.error.message} (${caughtError.payload.error.code})`);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("The backend request failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10 md:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-slate-950/35 p-8 shadow-float backdrop-blur">
          <p className="text-xs uppercase tracking-[0.38em] text-sky-200/65">Flowcast forecast inputs</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            The app now holds transactions, planned obligations, and protected savings in one forecasting workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-sky-50/78">
            Instead of treating ETF contributions and the Notgroschen like vague notes, Flowcast now models them as
            protected cash inputs alongside the transaction and planning layers the forecast engine will build on next.
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/8 p-8 shadow-float backdrop-blur">
          <p className="text-xs uppercase tracking-[0.32em] text-sky-200/65">Current focus</p>
          <p className="mt-4 text-2xl font-semibold text-white">Protected savings before full forecast simulation</p>
          <p className="mt-3 text-base leading-7 text-sky-50/78">
            Future goal math will only be trustworthy if the app knows which money is already reserved, which costs are
            essential, and how long a withdrawal would take to repair.
          </p>
        </div>
      </section>

      <HealthCard error={error} health={health} loading={loading} onRetry={() => void loadHealth()} />
      <ImportPanel />
      <TransactionWorkspace />
      <PlanningWorkspace />
      <SavingsWorkspace />
    </main>
  );
}
