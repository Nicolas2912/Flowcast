import { useEffect, useState } from "react";

import {
  fetchSavingsBuckets,
  fetchSavingsSummary,
  HttpError,
  updateSavingsBucket,
  type SavingsBucketResponse,
  type SavingsPlanSummaryResponse,
} from "../../lib/api";
import { Card } from "../ui/card";

const germanDate = new Intl.DateTimeFormat("de-DE");
const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

type BucketDraft = {
  current_amount: string;
  target_amount: string;
  monthly_contribution: string;
  priority: string;
  is_protected: boolean;
  allow_scenario_withdrawal: boolean;
};

function toErrorMessage(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof HttpError) {
    return `${caughtError.payload.error.message} (${caughtError.payload.error.code})`;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}

function toDraft(bucket: SavingsBucketResponse): BucketDraft {
  return {
    current_amount: String(bucket.current_amount),
    target_amount: bucket.target_amount === null ? "" : String(bucket.target_amount),
    monthly_contribution: String(bucket.monthly_contribution),
    priority: String(bucket.priority),
    is_protected: bucket.is_protected,
    allow_scenario_withdrawal: bucket.allow_scenario_withdrawal,
  };
}

function formatOptionalDate(value: string | null): string {
  return value ? germanDate.format(new Date(value)) : "Not reachable yet";
}

function bucketDescription(bucketType: string): string {
  if (bucketType === "emergency_fund") {
    return "Keep the Notgroschen separate so future goal planning never pretends this cash is free to spend.";
  }
  return "Treat the ETF contribution as protected investing, not lifestyle money the forecast can silently absorb.";
}

export function SavingsWorkspace() {
  const [buckets, setBuckets] = useState<SavingsBucketResponse[]>([]);
  const [drafts, setDrafts] = useState<Record<number, BucketDraft>>({});
  const [summary, setSummary] = useState<SavingsPlanSummaryResponse | null>(null);
  const [scenarioWithdrawalAmount, setScenarioWithdrawalAmount] = useState("0");
  const [loading, setLoading] = useState(true);
  const [savingBucketId, setSavingBucketId] = useState<number | null>(null);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSavingsData(nextScenarioAmount?: number) {
    setLoading(true);
    setError(null);
    try {
      const scenarioAmount =
        typeof nextScenarioAmount === "number"
          ? nextScenarioAmount
          : Number(scenarioWithdrawalAmount || "0") || 0;
      const [bucketResponse, summaryResponse] = await Promise.all([
        fetchSavingsBuckets(),
        fetchSavingsSummary(scenarioAmount),
      ]);
      setBuckets(bucketResponse);
      setDrafts(Object.fromEntries(bucketResponse.map((bucket) => [bucket.id, toDraft(bucket)])));
      setSummary(summaryResponse);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The savings workspace could not load."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSavingsData(0);
  }, []);

  function updateDraft(bucketId: number, patch: Partial<BucketDraft>) {
    setDrafts((current) => ({
      ...current,
      [bucketId]: {
        ...current[bucketId],
        ...patch,
      },
    }));
  }

  async function handleSave(bucket: SavingsBucketResponse) {
    const draft = drafts[bucket.id];
    if (!draft) {
      return;
    }

    setSavingBucketId(bucket.id);
    setError(null);
    try {
      await updateSavingsBucket(bucket.id, {
        current_amount: Number(draft.current_amount) || 0,
        target_amount: draft.target_amount.trim() === "" ? null : Number(draft.target_amount),
        monthly_contribution: Number(draft.monthly_contribution) || 0,
        priority: Math.max(1, Number(draft.priority) || 1),
        is_protected: draft.is_protected,
        allow_scenario_withdrawal: draft.allow_scenario_withdrawal,
      });
      await loadSavingsData();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The savings bucket could not be saved."));
    } finally {
      setSavingBucketId(null);
    }
  }

  async function refreshScenarioPreview() {
    setRefreshingSummary(true);
    setError(null);
    try {
      const nextAmount = Number(scenarioWithdrawalAmount || "0") || 0;
      setSummary(await fetchSavingsSummary(nextAmount));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The recovery preview could not be refreshed."));
    } finally {
      setRefreshingSummary(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-6 protected savings</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">ETF and emergency fund buckets</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-sky-50/75">
              Edit the protected savings values directly and keep them outside normal spending logic so the future
              forecast engine starts from honest available cash.
            </p>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            onClick={() => void loadSavingsData()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-5">
          {loading ? <p className="text-sm text-sky-100/70">Loading savings buckets...</p> : null}

          {buckets.map((bucket) => {
            const draft = drafts[bucket.id];
            if (!draft) {
              return null;
            }
            return (
              <div key={bucket.id} className="rounded-[24px] border border-white/10 bg-slate-950/32 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold text-white">{bucket.name}</h3>
                      <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.24em] text-sky-100/70">
                        {draft.is_protected ? "Protected" : "Flexible"}
                      </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-sky-50/75">{bucketDescription(bucket.bucket_type)}</p>
                  </div>
                  <div className="min-w-44 rounded-2xl bg-white/6 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-sky-100/60">Reserved now</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {germanCurrency.format(bucket.forecast_reserved_amount)}
                    </p>
                    <p className="mt-2 text-xs text-sky-100/60">
                      {bucket.target_gap !== null ? `Gap to target ${germanCurrency.format(bucket.target_gap)}` : "No target set"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Current amount</span>
                    <input
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                      min="0"
                      onChange={(event) => updateDraft(bucket.id, { current_amount: event.target.value })}
                      step="0.01"
                      type="number"
                      value={draft.current_amount}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Target amount</span>
                    <input
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                      min="0"
                      onChange={(event) => updateDraft(bucket.id, { target_amount: event.target.value })}
                      placeholder="Optional"
                      step="0.01"
                      type="number"
                      value={draft.target_amount}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">
                      Monthly contribution
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                      min="0"
                      onChange={(event) => updateDraft(bucket.id, { monthly_contribution: event.target.value })}
                      step="0.01"
                      type="number"
                      value={draft.monthly_contribution}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Priority</span>
                    <input
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                      min="1"
                      onChange={(event) => updateDraft(bucket.id, { priority: event.target.value })}
                      step="1"
                      type="number"
                      value={draft.priority}
                    />
                  </label>
                </div>

                {bucket.progress_ratio !== null ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-sky-100/60">
                      <span>Target progress</span>
                      <span>{Math.round(bucket.progress_ratio * 100)}%</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-sky-400 transition-all"
                        style={{ width: `${Math.min(bucket.progress_ratio * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-5">
                  <label className="flex items-center gap-3 text-sm text-sky-100/75">
                    <input
                      checked={draft.is_protected}
                      onChange={(event) => updateDraft(bucket.id, { is_protected: event.target.checked })}
                      type="checkbox"
                    />
                    Treat as protected savings
                  </label>
                  <label className="flex items-center gap-3 text-sm text-sky-100/75">
                    <input
                      checked={draft.allow_scenario_withdrawal}
                      onChange={(event) =>
                        updateDraft(bucket.id, { allow_scenario_withdrawal: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Allow withdrawal in scenario planning
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
                    disabled={savingBucketId === bucket.id}
                    onClick={() => void handleSave(bucket)}
                    type="button"
                  >
                    {savingBucketId === bucket.id ? "Saving..." : `Save ${bucket.name}`}
                  </button>
                  <p className="text-sm text-sky-100/60">
                    Protected buckets are not automatically available for later goal simulations.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Emergency fund health</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Target and recovery view</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-sky-50/75">
            The Notgroschen target is derived from the essential costs you already modeled, so the recovery dates stay
            tied to real obligations instead of guesswork.
          </p>
        </div>

        {summary ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <SummaryStat label="Reserved now" value={germanCurrency.format(summary.protected_current_amount)} />
              <SummaryStat
                label="Reserved monthly"
                value={germanCurrency.format(summary.protected_monthly_contribution)}
              />
              <SummaryStat
                label="Essential monthly"
                value={germanCurrency.format(summary.essential_monthly_expenses)}
              />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <TargetCard
                amount={summary.emergency_fund_target_amount}
                dateLabel={formatOptionalDate(summary.target_completion_date)}
                gap={summary.gap_to_current_target}
                title="Current target"
              />
              <TargetCard
                amount={summary.three_month_target}
                dateLabel={formatOptionalDate(summary.three_month_completion_date)}
                gap={summary.gap_to_three_month_target}
                title="3-month target"
              />
              <TargetCard
                amount={summary.six_month_target}
                dateLabel={formatOptionalDate(summary.six_month_completion_date)}
                gap={summary.gap_to_six_month_target}
                title="6-month target"
              />
            </div>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/32 p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="block flex-1">
                  <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">
                    Scenario withdrawal
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                    min="0"
                    onChange={(event) => setScenarioWithdrawalAmount(event.target.value)}
                    step="0.01"
                    type="number"
                    value={scenarioWithdrawalAmount}
                  />
                </label>
                <button
                  className="rounded-full border border-white/20 px-4 py-3 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={refreshingSummary}
                  onClick={() => void refreshScenarioPreview()}
                  type="button"
                >
                  {refreshingSummary ? "Refreshing..." : "Refresh recovery preview"}
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <SummaryStat
                  label="Remaining after withdrawal"
                  value={germanCurrency.format(summary.scenario_remaining_amount)}
                />
                <SummaryStat
                  label="Recovery to 3 months"
                  value={formatOptionalDate(summary.scenario_recovery_date_to_three_month_target)}
                />
              </div>

              <div className="mt-4 rounded-2xl bg-white/6 p-4 text-sm leading-7 text-sky-50/75">
                {summary.scenario_withdrawal_allowed
                  ? "Scenario withdrawals are enabled for the emergency fund, so you can see when the target would be restored."
                  : "Scenario withdrawals are disabled for this bucket, so recovery dates stay hidden until you allow them."}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.22em] text-sky-100/60">Essential expense basis</p>
              <div className="mt-3 space-y-3">
                {summary.essential_breakdown.length === 0 ? (
                  <div className="rounded-2xl bg-white/6 p-4 text-sm text-sky-100/70">
                    No essential planned payments or assumptions exist yet.
                  </div>
                ) : (
                  summary.essential_breakdown.map((item) => (
                    <div key={`${item.source_type}-${item.label}`} className="rounded-2xl bg-white/6 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{item.label}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/55">{item.source_type}</p>
                        </div>
                        <p className="text-sm font-semibold text-white">{germanCurrency.format(item.monthly_amount)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-sky-100/70">Loading emergency-fund summary...</p>
        )}
      </Card>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/6 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-sky-100/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function TargetCard({
  title,
  amount,
  gap,
  dateLabel,
}: {
  title: string;
  amount: number | null;
  gap: number | null;
  dateLabel: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/32 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-sky-100/60">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">
        {amount === null ? "Not set" : germanCurrency.format(amount)}
      </p>
      <p className="mt-2 text-sm text-sky-100/65">
        {gap === null ? "No target configured yet" : `Gap ${germanCurrency.format(gap)}`}
      </p>
      <p className="mt-4 text-sm text-sky-50/75">{dateLabel}</p>
    </div>
  );
}
