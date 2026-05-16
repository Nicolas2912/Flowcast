import { useEffect, useMemo, useState } from "react";

import {
  createGoal,
  createMerchantRule,
  createPlannedPayment,
  fetchHealth,
  fetchMerchantRules,
  HttpError,
  runMerchantRules,
  updateGoal,
  updateMerchantRule,
  updatePlannedPayment,
  type CategoryResponse,
  type GoalPayload,
  type GoalResponse,
  type HealthResponse,
  type MerchantRulePayload,
  type MerchantRuleResponse,
  type PlannedPaymentPayload,
  type PlannedPaymentResponse,
  type TransactionListResponse,
} from "../../lib/api";

type GoalsSubscriptionsRulesScreenProps = {
  categories: CategoryResponse[];
  goals: GoalResponse[];
  onDataChanged: () => Promise<void>;
  plannedPayments: PlannedPaymentResponse[];
  transactions: TransactionListResponse | null;
};

const germanDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const germanDateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const blankGoalForm: GoalPayload = {
  name: "",
  target_amount: 0,
  current_saved_amount: 0,
  priority: 2,
  goal_type: "general",
  funding_strategy: "monthly_allocation",
  is_active: true,
};

const blankSubscriptionForm: PlannedPaymentPayload = {
  account_id: 1,
  name: "",
  amount: 0,
  payment_type: "subscription",
  frequency: "monthly",
  day_of_month: 1,
  category_id: null,
  is_active: true,
};

const blankRuleForm: MerchantRulePayload = {
  name: "",
  pattern_type: "contains",
  pattern: "",
  category_id: 0,
  priority: 100,
  is_active: true,
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

function monthsUntilTarget(targetDate: string | null): number {
  if (!targetDate) {
    return 12;
  }
  const now = new Date();
  const target = new Date(targetDate);
  const deltaMonths =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()) + 1;
  return Math.max(deltaMonths, 1);
}

function deriveMonthlyAllocation(goal: GoalResponse): number {
  const gap = Math.max(goal.target_amount - goal.current_saved_amount, 0);
  return gap / monthsUntilTarget(goal.target_date);
}

function groupCategoryChildren(categories: CategoryResponse[]) {
  return categories
    .filter((category) => category.parent_id === null)
    .map((group) => ({
      group,
      children: categories.filter((category) => category.parent_id === group.id).slice(0, 3),
    }))
    .filter((item) => item.children.length > 0);
}

export function GoalsSubscriptionsRulesScreen({
  categories,
  goals,
  onDataChanged,
  plannedPayments,
  transactions,
}: GoalsSubscriptionsRulesScreenProps) {
  const [rules, setRules] = useState<MerchantRuleResponse[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [goalForm, setGoalForm] = useState<GoalPayload>(blankGoalForm);
  const [subscriptionForm, setSubscriptionForm] = useState<PlannedPaymentPayload>(blankSubscriptionForm);
  const [ruleForm, setRuleForm] = useState<MerchantRulePayload>(blankRuleForm);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<number | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const subscriptions = useMemo(
    () => plannedPayments.filter((payment) => payment.payment_type === "subscription" && payment.is_active),
    [plannedPayments],
  );
  const categoryGroups = useMemo(() => groupCategoryChildren(categories), [categories]);
  const selectableCategories = useMemo(
    () => categories.filter((category) => category.parent_id !== null),
    [categories],
  );
  const totalMonthlyAllocation = useMemo(
    () => goals.filter((goal) => goal.is_active).reduce((sum, goal) => sum + deriveMonthlyAllocation(goal), 0),
    [goals],
  );
  const totalMonthlySubscriptions = useMemo(
    () => subscriptions.reduce((sum, payment) => sum + payment.monthly_equivalent, 0),
    [subscriptions],
  );

  async function loadLocalData() {
    setLoading(true);
    setError(null);
    try {
      const [ruleResponse, healthResponse] = await Promise.all([fetchMerchantRules(), fetchHealth()]);
      setRules(ruleResponse);
      setHealth(healthResponse);
      setRuleForm((current) => ({
        ...current,
        category_id: current.category_id || selectableCategories[0]?.id || 0,
      }));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The setup workspace could not load."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLocalData();
  }, []);

  useEffect(() => {
    setSubscriptionForm((current) => ({
      ...current,
      account_id: current.account_id || 1,
      category_id: current.category_id ?? selectableCategories[0]?.id ?? null,
    }));
  }, [selectableCategories]);

  function resetGoalForm() {
    setGoalForm(blankGoalForm);
    setEditingGoalId(null);
    setShowGoalForm(false);
  }

  function resetSubscriptionForm() {
    setSubscriptionForm({
      ...blankSubscriptionForm,
      account_id: plannedPayments[0]?.account_id ?? 1,
      category_id: selectableCategories[0]?.id ?? null,
    });
    setEditingSubscriptionId(null);
    setShowSubscriptionForm(false);
  }

  function resetRuleForm() {
    setRuleForm({
      ...blankRuleForm,
      category_id: selectableCategories[0]?.id ?? 0,
    });
    setEditingRuleId(null);
    setShowRuleForm(false);
  }

  async function handleGoalSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingGoalId === null) {
        await createGoal(goalForm);
      } else {
        await updateGoal(editingGoalId, goalForm);
      }
      await onDataChanged();
      await loadLocalData();
      setSuccess(editingGoalId === null ? "Goal added." : "Goal updated.");
      resetGoalForm();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The goal could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubscriptionSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingSubscriptionId === null) {
        await createPlannedPayment(subscriptionForm);
      } else {
        await updatePlannedPayment(editingSubscriptionId, subscriptionForm);
      }
      await onDataChanged();
      await loadLocalData();
      setSuccess(editingSubscriptionId === null ? "Subscription added." : "Subscription updated.");
      resetSubscriptionForm();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The subscription could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRuleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingRuleId === null) {
        await createMerchantRule(ruleForm);
      } else {
        await updateMerchantRule(editingRuleId, ruleForm);
      }
      await onDataChanged();
      await loadLocalData();
      setSuccess(editingRuleId === null ? "Rule added." : "Rule updated.");
      resetRuleForm();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The rule could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunCategorization() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await runMerchantRules();
      await onDataChanged();
      await loadLocalData();
      setSuccess(`Categorization run completed: ${response.updated_count} updated.`);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The categorization run could not start."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="fc-page-stack">
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Goals, Subscriptions &amp; Rules</h1>
          <p className="fc-page-copy">Manage your savings goals, recurring payments, and categorization rules.</p>
        </div>
      </div>

      {error ? <div className="fc-global-error">{error}</div> : null}
      {success ? <div className="fc-inline-success">{success}</div> : null}

      <div className="fc-setup-grid">
        <div className="fc-card fc-setup-card">
          <div className="fc-card-header">
            <h2>Goals</h2>
            <button
              className="fc-outline-button"
              onClick={() => {
                setShowGoalForm((current) => !current);
                if (showGoalForm) {
                  resetGoalForm();
                }
              }}
              type="button"
            >
              + Add Goal
            </button>
          </div>

          {showGoalForm ? (
            <div className="fc-inline-form fc-inline-form--goals">
              <input
                onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Goal name"
                value={goalForm.name}
              />
              <input
                min="0"
                onChange={(event) =>
                  setGoalForm((current) => ({ ...current, target_amount: Number(event.target.value) || 0 }))
                }
                placeholder="Target amount"
                type="number"
                value={goalForm.target_amount || ""}
              />
              <input
                min="0"
                onChange={(event) =>
                  setGoalForm((current) => ({ ...current, current_saved_amount: Number(event.target.value) || 0 }))
                }
                placeholder="Saved"
                type="number"
                value={goalForm.current_saved_amount || ""}
              />
              <input
                max="5"
                min="1"
                onChange={(event) => setGoalForm((current) => ({ ...current, priority: Number(event.target.value) || 1 }))}
                placeholder="Priority"
                type="number"
                value={goalForm.priority || ""}
              />
              <input
                onChange={(event) => setGoalForm((current) => ({ ...current, target_date: event.target.value || null }))}
                type="date"
                value={goalForm.target_date ?? ""}
              />
              <div className="fc-inline-form-actions">
                <button
                  className="fc-upload-action"
                  disabled={saving || goalForm.name.trim() === "" || goalForm.target_amount <= 0}
                  onClick={() => void handleGoalSave()}
                  type="button"
                >
                  {editingGoalId === null ? "Save goal" : "Update goal"}
                </button>
                <button className="fc-outline-button" onClick={resetGoalForm} type="button">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="fc-setup-table-wrap">
            <table className="fc-setup-table">
              <thead>
                <tr>
                  <th>Goal</th>
                  <th>Target</th>
                  <th>Saved</th>
                  <th>Progress</th>
                  <th>Priority</th>
                  <th>Monthly Allocation</th>
                  <th>Target Date</th>
                </tr>
              </thead>
              <tbody>
                {goals.filter((goal) => goal.is_active).map((goal) => {
                  const progress = goal.target_amount > 0 ? Math.min((goal.current_saved_amount / goal.target_amount) * 100, 100) : 0;
                  return (
                    <tr
                      key={goal.id}
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
                        setShowGoalForm(true);
                      }}
                    >
                      <td className="fc-table-primary">{goal.name}</td>
                      <td>{germanCurrency.format(goal.target_amount)}</td>
                      <td>{germanCurrency.format(goal.current_saved_amount)}</td>
                      <td>
                        <div className="fc-mini-progress">
                          <div style={{ width: `${progress}%` }} />
                        </div>
                        <span>{Math.round(progress)}%</span>
                      </td>
                      <td>
                        <span className={`fc-priority-pill fc-priority-pill--${goal.priority >= 3 ? "high" : goal.priority === 2 ? "medium" : "low"}`}>
                          {goal.priority >= 3 ? "High" : goal.priority === 2 ? "Medium" : "Low"}
                        </span>
                      </td>
                      <td>{germanCurrency.format(deriveMonthlyAllocation(goal))}</td>
                      <td>{goal.target_date ? germanDate.format(new Date(goal.target_date)) : "Flexible"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="fc-setup-total">Total Monthly Allocation: {germanCurrency.format(totalMonthlyAllocation)}</div>
        </div>

        <div className="fc-card fc-setup-card">
          <div className="fc-card-header">
            <h2>Subscriptions</h2>
            <button
              className="fc-outline-button"
              onClick={() => {
                setShowSubscriptionForm((current) => !current);
                if (showSubscriptionForm) {
                  resetSubscriptionForm();
                }
              }}
              type="button"
            >
              + Add Subscription
            </button>
          </div>

          {showSubscriptionForm ? (
            <div className="fc-inline-form fc-inline-form--subscriptions">
              <input
                onChange={(event) => setSubscriptionForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Subscription name"
                value={subscriptionForm.name}
              />
              <input
                min="0"
                onChange={(event) =>
                  setSubscriptionForm((current) => ({ ...current, amount: Number(event.target.value) || 0 }))
                }
                placeholder="Amount"
                step="0.01"
                type="number"
                value={subscriptionForm.amount || ""}
              />
              <select
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    frequency: event.target.value as PlannedPaymentPayload["frequency"],
                  }))
                }
                value={subscriptionForm.frequency}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
              <input
                max="31"
                min="1"
                onChange={(event) =>
                  setSubscriptionForm((current) => ({ ...current, day_of_month: Number(event.target.value) || 1 }))
                }
                placeholder="Exec day"
                type="number"
                value={subscriptionForm.day_of_month || ""}
              />
              <select
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    category_id: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                value={subscriptionForm.category_id ?? ""}
              >
                {selectableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <div className="fc-inline-form-actions">
                <button
                  className="fc-upload-action"
                  disabled={saving || subscriptionForm.name.trim() === "" || subscriptionForm.amount <= 0}
                  onClick={() => void handleSubscriptionSave()}
                  type="button"
                >
                  {editingSubscriptionId === null ? "Save subscription" : "Update subscription"}
                </button>
                <button className="fc-outline-button" onClick={resetSubscriptionForm} type="button">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="fc-setup-table-wrap">
            <table className="fc-setup-table">
              <thead>
                <tr>
                  <th>Subscription</th>
                  <th>Amount</th>
                  <th>Frequency</th>
                  <th>Exec. Day</th>
                  <th>Category</th>
                  <th>Next Charge</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((payment) => (
                  <tr
                    key={payment.id}
                    onClick={() => {
                      setEditingSubscriptionId(payment.id);
                      setSubscriptionForm({
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
                      setShowSubscriptionForm(true);
                    }}
                  >
                    <td className="fc-table-primary">{payment.name}</td>
                    <td>{germanCurrency.format(payment.amount)}</td>
                    <td>{payment.frequency}</td>
                    <td>{payment.day_of_month ?? "—"}</td>
                    <td>{payment.category_name ?? "None"}</td>
                    <td>{payment.next_charge_date ? germanDate.format(new Date(payment.next_charge_date)) : "Paused"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fc-setup-total">Total Monthly: {germanCurrency.format(totalMonthlySubscriptions)}</div>
        </div>

        <div className="fc-card fc-setup-card">
          <div className="fc-card-header">
            <h2>Merchant Rules</h2>
            <button
              className="fc-outline-button"
              onClick={() => {
                setShowRuleForm((current) => !current);
                if (showRuleForm) {
                  resetRuleForm();
                }
              }}
              type="button"
            >
              + Add Rule
            </button>
          </div>

          {showRuleForm ? (
            <div className="fc-inline-form fc-inline-form--rules">
              <input
                onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Rule name"
                value={ruleForm.name}
              />
              <select
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    pattern_type: event.target.value as MerchantRulePayload["pattern_type"],
                  }))
                }
                value={ruleForm.pattern_type}
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
              <input
                onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))}
                placeholder="Pattern"
                value={ruleForm.pattern}
              />
              <select
                onChange={(event) =>
                  setRuleForm((current) => ({ ...current, category_id: Number(event.target.value) || 0 }))
                }
                value={ruleForm.category_id}
              >
                {selectableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <div className="fc-inline-form-actions">
                <button
                  className="fc-upload-action"
                  disabled={saving || ruleForm.name.trim() === "" || ruleForm.pattern.trim() === "" || ruleForm.category_id === 0}
                  onClick={() => void handleRuleSave()}
                  type="button"
                >
                  {editingRuleId === null ? "Save rule" : "Update rule"}
                </button>
                <button className="fc-outline-button" onClick={resetRuleForm} type="button">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="fc-rule-admin-list">
            {rules.slice(0, 5).map((rule) => (
              <button
                key={rule.id}
                className="fc-rule-admin-row"
                onClick={() => {
                  setEditingRuleId(rule.id);
                  setRuleForm({
                    name: rule.name,
                    pattern_type: rule.pattern_type,
                    pattern: rule.pattern,
                    category_id: rule.category_id,
                    priority: rule.priority,
                    is_active: rule.is_active,
                  });
                  setShowRuleForm(true);
                }}
                type="button"
              >
                <span>{rule.priority}</span>
                <strong>{rule.pattern}</strong>
                <small>{rule.category_name}</small>
              </button>
            ))}
          </div>
          <a className="fc-link-button" href="#fc-categories-card">
            View all rules
          </a>
        </div>

        <div className="fc-card fc-setup-card" id="fc-categories-card">
          <div className="fc-card-header">
            <h2>Categories</h2>
          </div>
          <div className="fc-category-groups">
            {categoryGroups.map(({ group, children }) => (
              <div key={group.id} className="fc-category-group">
                <div>
                  <strong>{group.name}</strong>
                  <span>{children.map((child) => child.name).join(", ")}</span>
                </div>
              </div>
            ))}
          </div>
          <a className="fc-link-button" href="#fc-status-card">
            Manage categories
          </a>
        </div>

        <div className="fc-card fc-setup-card" id="fc-status-card">
          <div className="fc-card-header">
            <div>
              <h2>Database Status</h2>
              <p className="fc-page-copy">
                {health?.status === "ok" ? "All systems operational" : loading ? "Checking services..." : "Attention needed"}
              </p>
            </div>
            <button
              className="fc-upload-action"
              disabled={saving}
              onClick={() => void handleRunCategorization()}
              type="button"
            >
              Run Categorization
            </button>
          </div>

          <div className="fc-status-grid">
            <StatusRow label="Transactions" value={String(transactions?.total ?? 0)} />
            <StatusRow label="Subscriptions" value={String(subscriptions.length)} />
            <StatusRow label="Goals" value={String(goals.filter((goal) => goal.is_active).length)} />
            <StatusRow label="Rules" value={String(rules.filter((rule) => rule.is_active).length)} />
          </div>

          <div className="fc-status-updated">
            Last updated: {health ? germanDateTime.format(new Date()) : "Waiting for health check"}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fc-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
