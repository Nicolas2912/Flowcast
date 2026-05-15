import { useEffect, useState } from "react";

import {
  compareForecastScenario,
  createGoal,
  fetchForecast,
  fetchGoals,
  HttpError,
  updateGoal,
  type ForecastBundleResponse,
  type ForecastComparisonResponse,
  type ForecastHorizonResponse,
  type ForecastScenarioPayload,
  type GoalPayload,
  type GoalResponse,
} from "../../lib/api";
import { Card } from "../ui/card";

const germanDate = new Intl.DateTimeFormat("de-DE");
const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const blankGoalForm: GoalPayload = {
  name: "",
  target_amount: 0,
  current_saved_amount: 0,
  priority: 3,
  goal_type: "lifestyle",
  funding_strategy: "priority",
  target_date: null,
  is_active: true,
  notes: "",
};

const defaultScenarioForm = {
  name: "Custom scenario",
  variable_spending_multiplier: "1",
  etf_monthly_contribution_override: "",
  emergency_fund_monthly_contribution_override: "",
  emergency_fund_withdrawal_amount: "0",
  one_off_expense_amount: "",
  one_off_expense_date: "",
  one_off_income_amount: "",
  one_off_income_date: "",
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

function findHorizon(bundle: ForecastBundleResponse | null, scenarioId: string, days: number): ForecastHorizonResponse | null {
  const scenario = bundle?.scenarios.find((item) => item.scenario_id === scenarioId);
  return scenario?.horizons.find((item) => item.days === days) ?? null;
}

function lastHorizon(scenarios: ForecastComparisonResponse["base"] | ForecastComparisonResponse["scenario"]): ForecastHorizonResponse | null {
  return scenarios.horizons.length > 0 ? scenarios.horizons[scenarios.horizons.length - 1] : null;
}

export function ForecastWorkspace() {
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [forecast, setForecast] = useState<ForecastBundleResponse | null>(null);
  const [comparison, setComparison] = useState<ForecastComparisonResponse | null>(null);
  const [goalForm, setGoalForm] = useState<GoalPayload>(blankGoalForm);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [scenarioForm, setScenarioForm] = useState(defaultScenarioForm);
  const [priorityOverrides, setPriorityOverrides] = useState<Record<number, string>>({});
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>(["expected"]);
  const [selectedHorizonDays, setSelectedHorizonDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadForecastWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const [goalsResponse, forecastResponse] = await Promise.all([fetchGoals(), fetchForecast()]);
      setGoals(goalsResponse);
      setForecast(forecastResponse);
      setPriorityOverrides(
        Object.fromEntries(goalsResponse.map((goal) => [goal.id, String(goal.priority)])),
      );
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The forecast workspace could not load."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadForecastWorkspace();
  }, []);

  function resetGoalForm() {
    setEditingGoalId(null);
    setGoalForm(blankGoalForm);
  }

  async function handleGoalSave() {
    setSaving(true);
    setError(null);
    try {
      if (editingGoalId === null) {
        await createGoal({
          ...goalForm,
          target_amount: Number(goalForm.target_amount) || 0,
          current_saved_amount: Number(goalForm.current_saved_amount) || 0,
          priority: Number(goalForm.priority) || 1,
        });
      } else {
        await updateGoal(editingGoalId, {
          ...goalForm,
          target_amount: Number(goalForm.target_amount) || 0,
          current_saved_amount: Number(goalForm.current_saved_amount) || 0,
          priority: Number(goalForm.priority) || 1,
        });
      }
      resetGoalForm();
      await loadForecastWorkspace();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The goal could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleScenarioCompare() {
    setSaving(true);
    setError(null);
    try {
      const payload: ForecastScenarioPayload = {
        name: scenarioForm.name,
        variable_spending_multiplier: Number(scenarioForm.variable_spending_multiplier) || 1,
        etf_monthly_contribution_override:
          scenarioForm.etf_monthly_contribution_override.trim() === ""
            ? null
            : Number(scenarioForm.etf_monthly_contribution_override),
        emergency_fund_monthly_contribution_override:
          scenarioForm.emergency_fund_monthly_contribution_override.trim() === ""
            ? null
            : Number(scenarioForm.emergency_fund_monthly_contribution_override),
        emergency_fund_withdrawal_amount: Number(scenarioForm.emergency_fund_withdrawal_amount) || 0,
        goal_priority_overrides: goals
          .filter((goal) => Number(priorityOverrides[goal.id] || goal.priority) !== goal.priority)
          .map((goal) => ({
            goal_id: goal.id,
            priority: Number(priorityOverrides[goal.id]) || goal.priority,
          })),
        one_off_expenses:
          scenarioForm.one_off_expense_amount && scenarioForm.one_off_expense_date
            ? [
                {
                  amount: Number(scenarioForm.one_off_expense_amount),
                  date: scenarioForm.one_off_expense_date,
                  label: "One-off expense",
                },
              ]
            : [],
        one_off_incomes:
          scenarioForm.one_off_income_amount && scenarioForm.one_off_income_date
            ? [
                {
                  amount: Number(scenarioForm.one_off_income_amount),
                  date: scenarioForm.one_off_income_date,
                  label: "One-off income",
                },
              ]
            : [],
      };
      setComparison(await compareForecastScenario(payload));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The custom scenario could not be compared."));
    } finally {
      setSaving(false);
    }
  }

  function toggleScenario(scenarioId: string) {
    setSelectedScenarioIds((current) =>
      current.includes(scenarioId) ? current.filter((item) => item !== scenarioId) : [...current, scenarioId],
    );
  }

  const selectedHorizons = selectedScenarioIds
    .map((scenarioId) => ({
      scenarioId,
      horizon: findHorizon(forecast, scenarioId, selectedHorizonDays),
    }))
    .filter((item) => item.horizon !== null);

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-7 forecast engine</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Daily forecast lines and goals</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-sky-50/75">
              The forecast now turns the imported history, planned obligations, protected savings, and lifestyle goals
              into deterministic daily balance projections instead of a single vague estimate.
            </p>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            onClick={() => void loadForecastWorkspace()}
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

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {[90, 180, 365].map((days) => (
            <button
              key={days}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                selectedHorizonDays === days
                  ? "bg-sky-500 text-white"
                  : "border border-white/20 text-white hover:border-white/40 hover:bg-white/10"
              }`}
              onClick={() => setSelectedHorizonDays(days)}
              type="button"
            >
              {days === 90 ? "90 days" : days === 180 ? "6 months" : "12 months"}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {forecast?.scenarios.map((scenario) => (
            <label key={scenario.scenario_id} className="flex items-center gap-3 rounded-full border border-white/12 px-4 py-2 text-sm text-sky-100/75">
              <input
                checked={selectedScenarioIds.includes(scenario.scenario_id)}
                onChange={() => toggleScenario(scenario.scenario_id)}
                type="checkbox"
              />
              {scenario.label}
            </label>
          ))}
        </div>

        {loading ? <p className="mt-6 text-sm text-sky-100/70">Loading forecast...</p> : null}

        <div className="mt-6 grid gap-4">
          {selectedHorizons.map(({ scenarioId, horizon }) => {
            if (!horizon) {
              return null;
            }
            return (
              <div key={scenarioId} className="rounded-[24px] border border-white/10 bg-slate-950/32 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-white">
                      {forecast?.scenarios.find((item) => item.scenario_id === scenarioId)?.label}
                    </h3>
                    <p className="mt-2 text-sm text-sky-100/65">
                      Variable spend multiplier{" "}
                      {forecast?.scenarios.find((item) => item.scenario_id === scenarioId)?.variable_spending_multiplier}x
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Ending balance" value={germanCurrency.format(horizon.risk.ending_balance)} />
                    <Stat label="Min balance" value={germanCurrency.format(horizon.risk.minimum_balance)} />
                    <Stat label="Negative days" value={String(horizon.risk.negative_day_count)} />
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-white/8">
                  <table className="min-w-full divide-y divide-white/8 text-sm">
                    <thead className="bg-white/5 text-sky-100/70">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Date</th>
                        <th className="px-4 py-3 text-right font-medium">Balance</th>
                        <th className="px-4 py-3 text-right font-medium">Available</th>
                        <th className="px-4 py-3 text-right font-medium">Goal funding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {horizon.points.slice(0, 18).map((point) => (
                        <tr key={`${scenarioId}-${point.date}`}>
                          <td className="px-4 py-3 text-sky-50/80">{germanDate.format(new Date(point.date))}</td>
                          <td className="px-4 py-3 text-right text-white">{germanCurrency.format(point.balance)}</td>
                          <td className="px-4 py-3 text-right text-white">
                            {germanCurrency.format(point.available_balance)}
                          </td>
                          <td className="px-4 py-3 text-right text-white">
                            {point.goal_funded_amount === 0 ? "—" : germanCurrency.format(point.goal_funded_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {horizon.goals.map((goal) => (
                    <div key={`${scenarioId}-${goal.goal_id}`} className="rounded-2xl bg-white/6 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{goal.goal_name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/55">
                            Priority {goal.priority} · {goal.funding_strategy}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{germanCurrency.format(goal.projected_saved_amount)}</p>
                          <p className="mt-1 text-xs text-sky-100/55">Gap {germanCurrency.format(goal.remaining_gap)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-sky-50/75">
                        Affordable {goal.affordability_date ? germanDate.format(new Date(goal.affordability_date)) : "not within horizon"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6">
        <Card>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Goals</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Lifestyle goal planning</h2>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Name</span>
              <input
                className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))}
                value={goalForm.name}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Target amount</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) => setGoalForm((current) => ({ ...current, target_amount: Number(event.target.value) || 0 }))}
                  step="0.01"
                  type="number"
                  value={goalForm.target_amount || ""}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Already saved</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) =>
                    setGoalForm((current) => ({ ...current, current_saved_amount: Number(event.target.value) || 0 }))
                  }
                  step="0.01"
                  type="number"
                  value={goalForm.current_saved_amount || ""}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Priority</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="1"
                  onChange={(event) => setGoalForm((current) => ({ ...current, priority: Number(event.target.value) || 1 }))}
                  type="number"
                  value={goalForm.priority || ""}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Goal type</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  onChange={(event) => setGoalForm((current) => ({ ...current, goal_type: event.target.value }))}
                  value={goalForm.goal_type ?? ""}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Funding</span>
                <select
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  onChange={(event) => setGoalForm((current) => ({ ...current, funding_strategy: event.target.value }))}
                  value={goalForm.funding_strategy ?? "priority"}
                >
                  <option value="priority">Priority</option>
                  <option value="parallel">Parallel</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Target date</span>
              <input
                className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                onChange={(event) => setGoalForm((current) => ({ ...current, target_date: event.target.value || null }))}
                type="date"
                value={goalForm.target_date ?? ""}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
              disabled={saving || goalForm.name.trim() === "" || Number(goalForm.target_amount) <= 0}
              onClick={() => void handleGoalSave()}
              type="button"
            >
              {editingGoalId === null ? "Create goal" : "Save goal"}
            </button>
            {editingGoalId !== null ? (
              <button
                className="rounded-full border border-white/20 px-4 py-3 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                onClick={resetGoalForm}
                type="button"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            {goals.map((goal) => (
              <div key={goal.id} className="rounded-2xl bg-white/6 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{goal.name}</p>
                    <p className="mt-1 text-xs text-sky-100/60">
                      {germanCurrency.format(goal.current_saved_amount)} / {germanCurrency.format(goal.target_amount)} · priority {goal.priority}
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-white transition hover:border-white/40 hover:bg-white/10"
                    onClick={() => {
                      setEditingGoalId(goal.id);
                      setGoalForm({
                        name: goal.name,
                        target_amount: goal.target_amount,
                        current_saved_amount: goal.current_saved_amount,
                        priority: goal.priority,
                        goal_type: goal.goal_type,
                        funding_strategy: goal.funding_strategy,
                        target_date: goal.target_date,
                        is_active: goal.is_active,
                        notes: goal.notes,
                      });
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Scenario planning</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Explicit trade-off comparison</h2>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Scenario name</span>
              <input
                className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                onChange={(event) => setScenarioForm((current) => ({ ...current, name: event.target.value }))}
                value={scenarioForm.name}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Variable spend multiplier</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0.1"
                  onChange={(event) =>
                    setScenarioForm((current) => ({ ...current, variable_spending_multiplier: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={scenarioForm.variable_spending_multiplier}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Emergency withdrawal</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) =>
                    setScenarioForm((current) => ({ ...current, emergency_fund_withdrawal_amount: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={scenarioForm.emergency_fund_withdrawal_amount}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">ETF contribution override</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) =>
                    setScenarioForm((current) => ({ ...current, etf_monthly_contribution_override: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={scenarioForm.etf_monthly_contribution_override}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Notgroschen contribution override</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) =>
                    setScenarioForm((current) => ({
                      ...current,
                      emergency_fund_monthly_contribution_override: event.target.value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={scenarioForm.emergency_fund_monthly_contribution_override}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">One-off expense</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) => setScenarioForm((current) => ({ ...current, one_off_expense_amount: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={scenarioForm.one_off_expense_amount}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">One-off expense date</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  onChange={(event) => setScenarioForm((current) => ({ ...current, one_off_expense_date: event.target.value }))}
                  type="date"
                  value={scenarioForm.one_off_expense_date}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">One-off income</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  min="0"
                  onChange={(event) => setScenarioForm((current) => ({ ...current, one_off_income_amount: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={scenarioForm.one_off_income_amount}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">One-off income date</span>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                  onChange={(event) => setScenarioForm((current) => ({ ...current, one_off_income_date: event.target.value }))}
                  type="date"
                  value={scenarioForm.one_off_income_date}
                />
              </label>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-slate-950/32 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-sky-100/60">Temporary goal priorities</p>
              <div className="mt-3 space-y-3">
                {goals.map((goal) => (
                  <label key={goal.id} className="flex items-center justify-between gap-3 text-sm text-sky-50/78">
                    <span>{goal.name}</span>
                    <input
                      className="w-24 rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-2 text-right text-white outline-none"
                      min="1"
                      onChange={(event) =>
                        setPriorityOverrides((current) => ({ ...current, [goal.id]: event.target.value }))
                      }
                      type="number"
                      value={priorityOverrides[goal.id] ?? goal.priority}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <button
              className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
              disabled={saving}
              onClick={() => void handleScenarioCompare()}
              type="button"
            >
              {saving ? "Comparing..." : "Compare scenario"}
            </button>
          </div>

          {comparison ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="12m ending delta" value={germanCurrency.format(comparison.ending_balance_delta_12m)} />
                <Stat
                  label="12m available delta"
                  value={germanCurrency.format(comparison.available_balance_delta_12m)}
                />
                <Stat
                  label="Earliest goal delta"
                  value={
                    comparison.earliest_goal_delta_days === null
                      ? "No change"
                      : `${comparison.earliest_goal_delta_days} days`
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ScenarioSummaryCard title={comparison.base.label} horizon={lastHorizon(comparison.base)} />
                <ScenarioSummaryCard
                  title={comparison.scenario.label}
                  horizon={lastHorizon(comparison.scenario)}
                />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/6 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-sky-100/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ScenarioSummaryCard({ title, horizon }: { title: string; horizon: ForecastHorizonResponse | null }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/32 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-sky-100/60">{title}</p>
      {horizon ? (
        <>
          <p className="mt-3 text-2xl font-semibold text-white">{germanCurrency.format(horizon.risk.ending_balance)}</p>
          <p className="mt-2 text-sm text-sky-100/65">
            Min {germanCurrency.format(horizon.risk.minimum_balance)} · Negative days {horizon.risk.negative_day_count}
          </p>
          <div className="mt-4 space-y-2">
            {horizon.goals.map((goal) => (
              <div key={goal.goal_id} className="rounded-2xl bg-white/6 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">{goal.goal_name}</span>
                  <span className="text-xs text-sky-100/65">
                    {goal.affordability_date ? germanDate.format(new Date(goal.affordability_date)) : "Later"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-sky-100/65">No horizon data.</p>
      )}
    </div>
  );
}
