import { useEffect, useState } from "react";

import {
  createPlannedPayment,
  fetchAccounts,
  fetchCategories,
  fetchPlannedPayments,
  fetchSpendingAssumptions,
  HttpError,
  recalculateSpendingAssumptions,
  updatePlannedPayment,
  updateSpendingAssumption,
  type AccountResponse,
  type CategoryResponse,
  type PlannedPaymentPayload,
  type PlannedPaymentResponse,
  type SpendingAssumptionResponse,
} from "../../lib/api";
import { Card } from "../ui/card";

const germanDate = new Intl.DateTimeFormat("de-DE");
const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const blankPaymentForm: PlannedPaymentPayload = {
  account_id: 1,
  name: "",
  amount: 0,
  payment_type: "subscription",
  frequency: "monthly",
  day_of_month: 1,
  category_id: null,
  is_active: true,
  notes: "",
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

export function PlanningWorkspace() {
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [plannedPayments, setPlannedPayments] = useState<PlannedPaymentResponse[]>([]);
  const [assumptions, setAssumptions] = useState<SpendingAssumptionResponse[]>([]);
  const [paymentForm, setPaymentForm] = useState<PlannedPaymentPayload>(blankPaymentForm);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editingAssumptionId, setEditingAssumptionId] = useState<number | null>(null);
  const [manualOverrideValue, setManualOverrideValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPlanningData() {
    setLoading(true);
    setError(null);
    try {
      const [accountsResponse, categoriesResponse, paymentsResponse, assumptionsResponse] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
        fetchPlannedPayments(),
        fetchSpendingAssumptions(),
      ]);
      setAccounts(accountsResponse);
      setCategories(categoriesResponse);
      setPlannedPayments(paymentsResponse);
      setAssumptions(assumptionsResponse);
      setPaymentForm((current) => ({
        ...current,
        account_id: current.account_id || accountsResponse[0]?.id || 1,
      }));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The planning workspace could not load."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlanningData();
  }, []);

  async function handlePaymentSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = normalizePaymentPayload(paymentForm);
      if (editingPaymentId === null) {
        await createPlannedPayment(payload);
      } else {
        await updatePlannedPayment(editingPaymentId, payload);
      }
      resetPaymentForm();
      await loadPlanningData();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The planned payment could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(payment: PlannedPaymentResponse) {
    setSaving(true);
    setError(null);
    try {
      await updatePlannedPayment(payment.id, { is_active: !payment.is_active });
      if (editingPaymentId === payment.id) {
        resetPaymentForm();
      }
      await loadPlanningData();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The planned payment could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalculateAssumptions() {
    setSaving(true);
    setError(null);
    try {
      const response = await recalculateSpendingAssumptions();
      setAssumptions(response);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The spending assumptions could not be recalculated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleOverrideSave() {
    if (editingAssumptionId === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSpendingAssumption(editingAssumptionId, {
        manual_monthly_amount: Number(manualOverrideValue),
      });
      setAssumptions((current) => current.map((assumption) => (assumption.id === updated.id ? updated : assumption)));
      setEditingAssumptionId(null);
      setManualOverrideValue("");
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The manual override could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevertAssumption(assumptionId: number) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSpendingAssumption(assumptionId, { revert_to_automatic: true });
      setAssumptions((current) => current.map((assumption) => (assumption.id === updated.id ? updated : assumption)));
      if (editingAssumptionId === assumptionId) {
        setEditingAssumptionId(null);
        setManualOverrideValue("");
      }
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The override could not be reverted."));
    } finally {
      setSaving(false);
    }
  }

  function resetPaymentForm() {
    setEditingPaymentId(null);
    setPaymentForm({
      ...blankPaymentForm,
      account_id: accounts[0]?.id || 1,
    });
  }

  const selectableCategories = categories.filter((category) => category.parent_id !== null);
  const totalMonthlyEquivalent = plannedPayments
    .filter((payment) => payment.is_active)
    .reduce((sum, payment) => sum + payment.monthly_equivalent, 0);

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-5 obligations</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Planned payments</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-sky-50/75">
              Capture future fixed obligations separately from history so the forecast engine can use real due dates and
              monthly equivalents without mixing them into transaction baselines.
            </p>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            onClick={() => void loadPlanningData()}
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

        <div className="mt-6 grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/30 p-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Name</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setPaymentForm((current) => ({ ...current, name: event.target.value }))}
              value={paymentForm.name}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Amount</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              min="0.01"
              onChange={(event) => setPaymentForm((current) => ({ ...current, amount: Number(event.target.value) || 0 }))}
              step="0.01"
              type="number"
              value={paymentForm.amount || ""}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Frequency</span>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  frequency: event.target.value as PlannedPaymentPayload["frequency"],
                }))
              }
              value={paymentForm.frequency}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One-time</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Payment type</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setPaymentForm((current) => ({ ...current, payment_type: event.target.value }))}
              value={paymentForm.payment_type}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Account</span>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setPaymentForm((current) => ({ ...current, account_id: Number(event.target.value) }))}
              value={paymentForm.account_id}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Category</span>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  category_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={paymentForm.category_id ?? ""}
            >
              <option value="">No category</option>
              {selectableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parent_name ? `${category.parent_name} / ${category.name}` : category.name}
                </option>
              ))}
            </select>
          </label>

          {paymentForm.frequency === "monthly" ? (
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Day of month</span>
              <input
                className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                max="31"
                min="1"
                onChange={(event) =>
                  setPaymentForm((current) => ({ ...current, day_of_month: Number(event.target.value) || null }))
                }
                type="number"
                value={paymentForm.day_of_month ?? ""}
              />
            </label>
          ) : null}

          {paymentForm.frequency === "quarterly" || paymentForm.frequency === "yearly" || paymentForm.frequency === "one_time" ? (
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">
                {paymentForm.frequency === "one_time" ? "Exact date" : "Anchor date"}
              </span>
              <input
                className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
                onChange={(event) => setPaymentForm((current) => ({ ...current, exact_date: event.target.value || null }))}
                type="date"
                value={paymentForm.exact_date ?? ""}
              />
            </label>
          ) : null}

          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Notes</span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
              value={paymentForm.notes ?? ""}
            />
          </label>

          <label className="flex items-center gap-3 text-sm text-sky-100/75">
            <input
              checked={Boolean(paymentForm.is_active)}
              onChange={(event) => setPaymentForm((current) => ({ ...current, is_active: event.target.checked }))}
              type="checkbox"
            />
            Active
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
            disabled={saving || paymentForm.name.trim() === "" || paymentForm.amount === 0}
            onClick={() => void handlePaymentSave()}
            type="button"
          >
            {editingPaymentId === null ? "Create planned payment" : "Save planned payment"}
          </button>
          {editingPaymentId !== null ? (
            <button
              className="rounded-full border border-white/20 px-4 py-3 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
              onClick={resetPaymentForm}
              type="button"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
          <span className="text-sm text-sky-100/75">Active monthly equivalent total</span>
          <span className="text-lg font-semibold text-white">{germanCurrency.format(totalMonthlyEquivalent)}</span>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? <p className="text-sm text-sky-100/70">Loading planned payments...</p> : null}
          {!loading && plannedPayments.length === 0 ? <p className="text-sm text-sky-100/70">No planned payments yet.</p> : null}
          {plannedPayments.map((payment) => (
            <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">{payment.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/60">
                    {payment.frequency} · {payment.payment_type} · {payment.is_active ? "active" : "inactive"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{germanCurrency.format(payment.amount)}</p>
                  <p className="mt-1 text-xs text-sky-100/65">
                    Monthly equivalent {germanCurrency.format(payment.monthly_equivalent)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-sky-50/80 md:grid-cols-3">
                <div>Next charge: {payment.next_charge_date ? germanDate.format(new Date(payment.next_charge_date)) : "Inactive or past"}</div>
                <div>Category: {payment.category_name ?? "None"}</div>
                <div>Account: {payment.account_name}</div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white"
                  onClick={() => {
                    setEditingPaymentId(payment.id);
                    setPaymentForm({
                      account_id: payment.account_id,
                      name: payment.name,
                      amount: payment.amount,
                      payment_type: payment.payment_type,
                      frequency: payment.frequency,
                      exact_date: payment.exact_date,
                      day_of_month: payment.day_of_month,
                      month_of_year: payment.month_of_year,
                      category_id: payment.category_id,
                      is_active: payment.is_active,
                      notes: payment.notes,
                    });
                  }}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white"
                  onClick={() => void handleDeactivate(payment)}
                  type="button"
                >
                  {payment.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-5 assumptions</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Variable spending baselines</h2>
            <p className="mt-3 text-sm leading-7 text-sky-50/75">
              These assumptions use the last three complete months when available, skip the partial current month, and
              let you exclude one-off purchases or apply a manual override without rewriting transaction history.
            </p>
          </div>
          <button
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
            disabled={saving}
            onClick={() => void handleRecalculateAssumptions()}
            type="button"
          >
            Recalculate
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? <p className="text-sm text-sky-100/70">Loading spending assumptions...</p> : null}
          {!loading && assumptions.length === 0 ? <p className="text-sm text-sky-100/70">No variable-spend assumptions yet.</p> : null}
          {assumptions.map((assumption) => (
            <div key={assumption.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">{assumption.category_name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/60">
                    {assumption.calculation_method} · {assumption.confidence}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-white">
                    {germanCurrency.format(assumption.effective_monthly_amount)}
                  </p>
                  <p className="mt-1 text-xs text-sky-100/65">Effective monthly amount</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-sky-50/80 md:grid-cols-2">
                <div>Automatic: {assumption.auto_monthly_amount === null ? "Needs manual input" : germanCurrency.format(assumption.auto_monthly_amount)}</div>
                <div>Manual: {assumption.manual_monthly_amount === null ? "None" : germanCurrency.format(assumption.manual_monthly_amount)}</div>
                <div>Months used: {assumption.baseline_months.length > 0 ? assumption.baseline_months.join(", ") : "No complete months yet"}</div>
                <div>Month count: {assumption.baseline_month_count}</div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {editingAssumptionId === assumption.id ? (
                  <>
                    <input
                      className="w-40 rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-2 text-white outline-none"
                      onChange={(event) => setManualOverrideValue(event.target.value)}
                      step="0.01"
                      type="number"
                      value={manualOverrideValue}
                    />
                    <button
                      className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
                      onClick={() => void handleOverrideSave()}
                      type="button"
                    >
                      Save override
                    </button>
                    <button
                      className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                      onClick={() => {
                        setEditingAssumptionId(null);
                        setManualOverrideValue("");
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                    onClick={() => {
                      setEditingAssumptionId(assumption.id);
                      setManualOverrideValue(String(assumption.manual_monthly_amount ?? assumption.effective_monthly_amount));
                    }}
                    type="button"
                  >
                    Override manually
                  </button>
                )}

                {assumption.manual_monthly_amount !== null ? (
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                    onClick={() => void handleRevertAssumption(assumption.id)}
                    type="button"
                  >
                    Revert to automatic
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function normalizePaymentPayload(payload: PlannedPaymentPayload): PlannedPaymentPayload {
  const normalized: PlannedPaymentPayload = {
    account_id: payload.account_id,
    name: payload.name.trim(),
    amount: payload.amount,
    payment_type: payload.payment_type.trim(),
    frequency: payload.frequency,
    category_id: payload.category_id ?? null,
    is_active: payload.is_active ?? true,
    notes: payload.notes?.trim() || null,
  };

  if (payload.frequency === "monthly") {
    normalized.day_of_month = payload.day_of_month ?? 1;
  } else if (payload.frequency === "yearly" || payload.frequency === "quarterly" || payload.frequency === "one_time") {
    normalized.exact_date = payload.exact_date ?? null;
  }

  if (payload.month_of_year !== undefined) {
    normalized.month_of_year = payload.month_of_year;
  }
  return normalized;
}
