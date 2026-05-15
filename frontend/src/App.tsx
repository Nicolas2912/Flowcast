import { useEffect, useState } from "react";

import { ImportPanel } from "./components/import/import-panel";
import { PlanningWorkspace } from "./components/planning/planning-workspace";
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
          <p className="text-xs uppercase tracking-[0.38em] text-sky-200/65">Flowcast transaction truth</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Imports now feed a real planning workspace with transaction truth, future obligations, and spending assumptions.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-sky-50/78">
            The app now covers both sides of the forecasting input layer: trustworthy categorized history and explicit
            future expectations for recurring costs and variable spending.
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/8 p-8 shadow-float backdrop-blur">
          <p className="text-xs uppercase tracking-[0.32em] text-sky-200/65">Current focus</p>
          <p className="mt-4 text-2xl font-semibold text-white">Predictable categorization over black-box guesses</p>
          <p className="mt-3 text-base leading-7 text-sky-50/78">
            Manual choices stick, recurring obligations stay separate from history, and variable spending baselines can
            be corrected without rewriting imported transactions.
          </p>
        </div>
      </section>

      <HealthCard error={error} health={health} loading={loading} onRetry={() => void loadHealth()} />
      <ImportPanel />
      <TransactionWorkspace />
      <PlanningWorkspace />
    </main>
  );
}
