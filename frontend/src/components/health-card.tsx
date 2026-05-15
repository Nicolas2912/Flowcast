import { Card } from "./ui/card";
import type { HealthResponse } from "../lib/api";

type HealthCardProps = {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function HealthCard({ health, loading, error, onRetry }: HealthCardProps) {
  const statusTone = error ? "text-amber-300" : "text-emerald-300";

  return (
    <Card className="overflow-hidden">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Connection</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Backend health</h2>
        </div>
        <button
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-slate-950/35 p-5">
          <p className="text-sm text-sky-100/70">API status</p>
          <p className={`mt-2 text-3xl font-semibold ${statusTone}`}>
            {loading ? "Checking..." : error ? "Unavailable" : health?.status ?? "Unknown"}
          </p>
          <p className="mt-3 text-sm leading-6 text-sky-50/70">
            {error
              ? error
              : "This card proves the frontend can reach the backend through the typed API wrapper."}
          </p>
        </div>

        <div className="rounded-3xl bg-white/6 p-5">
          <p className="text-sm text-sky-100/70">Runtime details</p>
          <dl className="mt-3 space-y-2 text-sm text-sky-50/85">
            <div className="flex justify-between gap-6">
              <dt>App</dt>
              <dd>{health?.app ?? "Waiting"}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt>Version</dt>
              <dd>{health?.version ?? "Waiting"}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt>Environment</dt>
              <dd>{health?.environment ?? "Waiting"}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt>Database</dt>
              <dd>{health?.database ?? "Waiting"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Card>
  );
}
