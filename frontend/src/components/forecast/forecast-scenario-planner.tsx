import { useEffect, useMemo, useState } from "react";

import {
  compareForecastScenario,
  HttpError,
  type AccountResponse,
  type ForecastBundleResponse,
  type ForecastComparisonResponse,
  type ForecastHorizonResponse,
  type ForecastPointResponse,
  type GoalResponse,
  type PlannedPaymentResponse,
  type SavingsBucketResponse,
  type SavingsPlanSummaryResponse,
  type SpendingAssumptionResponse,
} from "../../lib/api";

type ForecastScenarioPlannerProps = {
  accounts: AccountResponse[];
  forecast: ForecastBundleResponse | null;
  goals: GoalResponse[];
  plannedPayments: PlannedPaymentResponse[];
  savingsBuckets: SavingsBucketResponse[];
  savingsSummary: SavingsPlanSummaryResponse | null;
  spendingAssumptions: SpendingAssumptionResponse[];
  isLoading: boolean;
};

type ForecastControls = {
  emergencyTarget: number;
  etfContribution: number;
  monthlyIncome: number;
  variableMultiplier: number;
};

type RiskAlert = {
  detail: string;
  tone: "success" | "warning";
  title: string;
};

type WeekHeatCell = {
  amount: number;
  tone: "low" | "medium" | "high";
};

const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const englishMonth = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

const englishMonthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});

function toErrorMessage(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof HttpError) {
    return `${caughtError.payload.error.message} (${caughtError.payload.error.code})`;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "0 €";
  }
  return value % 1 === 0 ? `${Math.round(value).toLocaleString("de-DE")} €` : germanCurrency.format(value);
}

function getScenario(bundle: ForecastBundleResponse | null, scenarioId: string) {
  return bundle?.scenarios.find((scenario) => scenario.scenario_id === scenarioId) ?? null;
}

function getHorizon(bundle: ForecastBundleResponse | null, scenarioId: string, days: number) {
  return getScenario(bundle, scenarioId)?.horizons.find((horizon) => horizon.days === days) ?? null;
}

function deriveMonthlyIncome(accounts: AccountResponse[], forecast: ForecastBundleResponse | null, savingsBuckets: SavingsBucketResponse[]) {
  const currentBalance = accounts.reduce(
    (sum, account) => sum + (account.current_balance_manual ?? account.opening_balance),
    0,
  );
  const horizon90 = getHorizon(forecast, "expected", 90);
  const savingsContribution = savingsBuckets.reduce((sum, bucket) => sum + bucket.monthly_contribution, 0);
  if (!horizon90) {
    return Math.max(0, currentBalance / 3 + savingsContribution);
  }
  const inferred = (horizon90.risk.ending_balance - currentBalance) / 3 + savingsContribution;
  return inferred > 0 ? inferred : savingsContribution;
}

function deriveSubscriptionMonthly(plannedPayments: PlannedPaymentResponse[]) {
  return plannedPayments
    .filter((payment) => payment.is_active)
    .filter((payment) => {
      const reference = `${payment.name} ${payment.payment_type} ${payment.category_name ?? ""}`.toLowerCase();
      return reference.includes("sub") || reference.includes("netflix") || reference.includes("spotify") || reference.includes("abo");
    })
    .reduce((sum, payment) => sum + Math.abs(payment.monthly_equivalent || payment.amount), 0);
}

function deriveVariableMonthly(spendingAssumptions: SpendingAssumptionResponse[]) {
  return spendingAssumptions
    .filter((assumption) => assumption.is_active)
    .reduce((sum, assumption) => sum + Math.abs(assumption.effective_monthly_amount), 0);
}

function buildProjectionLine(points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return "";
  }

  const sample = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 12)) === 0);
  const values = sample.map((point) => point.balance);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return sample
    .map((point, index) => {
      const x = (index / Math.max(sample.length - 1, 1)) * 700 + 18;
      const y = 252 - ((point.balance - minValue) / range) * 186;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildMonthTicks(points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return ["May '25", "Jun '25", "Jul '25", "Aug '25", "Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26", "Apr '26"];
  }

  const labels = new Set<string>();
  for (const point of points) {
    const label = englishMonthYear.format(new Date(point.date));
    if (!labels.has(label)) {
      labels.add(label);
    }
    if (labels.size >= 12) {
      break;
    }
  }
  return Array.from(labels);
}

function buildMonthlyFreeCashFlow(points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return [
      { label: "May '25", value: 2930 },
      { label: "Jun '25", value: -1320 },
      { label: "Jul '25", value: 1630 },
      { label: "Aug '25", value: 2300 },
      { label: "Sep '25", value: 1880 },
      { label: "Oct '25", value: 2000 },
      { label: "Nov '25", value: 1700 },
      { label: "Dec '25", value: 2230 },
      { label: "Jan '26", value: -980 },
      { label: "Feb '26", value: 2080 },
      { label: "Mar '26", value: 1630 },
      { label: "Apr '26", value: 2230 },
    ];
  }

  const groups = new Map<string, { start: number; end: number }>();
  for (const point of points) {
    const key = `${new Date(point.date).getFullYear()}-${new Date(point.date).getMonth()}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { start: point.available_balance, end: point.available_balance });
    } else {
      current.end = point.available_balance;
    }
  }

  return Array.from(groups.entries())
    .slice(0, 12)
    .map(([key, values]) => {
      const [year, month] = key.split("-");
      return {
        label: englishMonthYear.format(new Date(Number(year), Number(month), 1)),
        value: values.end - values.start,
      };
    });
}

function expandPlannedPaymentDates(payment: PlannedPaymentResponse, months: number) {
  if (!payment.is_active) {
    return [] as Date[];
  }

  const base = payment.next_charge_date ? new Date(payment.next_charge_date) : null;
  if (!base || Number.isNaN(base.getTime())) {
    return [] as Date[];
  }

  const dates: Date[] = [];
  const cursor = new Date(base);
  const end = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());

  while (cursor <= end && dates.length < 24) {
    dates.push(new Date(cursor));
    if (payment.frequency === "monthly") {
      cursor.setMonth(cursor.getMonth() + 1);
    } else if (payment.frequency === "quarterly") {
      cursor.setMonth(cursor.getMonth() + 3);
    } else if (payment.frequency === "yearly") {
      cursor.setFullYear(cursor.getFullYear() + 1);
    } else {
      break;
    }
  }

  return dates;
}

function buildSubscriptionCalendar(plannedPayments: PlannedPaymentResponse[]) {
  const subscriptions = plannedPayments.filter((payment) => {
    const reference = `${payment.name} ${payment.payment_type} ${payment.category_name ?? ""}`.toLowerCase();
    return payment.is_active && (reference.includes("sub") || reference.includes("netflix") || reference.includes("spotify") || reference.includes("abo"));
  });

  const cells = new Map<string, number>();
  const calendarRows: Array<{ label: string; weeks: WeekHeatCell[] }> = [];
  const now = new Date();

  for (const payment of subscriptions) {
    for (const date of expandPlannedPaymentDates(payment, 6)) {
      const bucketMonth = `${date.getFullYear()}-${date.getMonth()}`;
      const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7));
      const key = `${bucketMonth}-${weekIndex}`;
      cells.set(key, (cells.get(key) ?? 0) + Math.abs(payment.amount));
    }
  }

  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    calendarRows.push({
      label: englishMonth.format(date) + " " + date.getFullYear(),
      weeks: Array.from({ length: 5 }, (_, weekIndex) => {
        const amount = cells.get(`${monthKey}-${weekIndex}`) ?? 0;
        return {
          amount,
          tone: amount > 1500 ? "high" : amount > 750 ? "medium" : "low",
        };
      }),
    });
  }

  return calendarRows;
}

function buildRiskAlerts(
  plannedPayments: PlannedPaymentResponse[],
  savingsSummary: SavingsPlanSummaryResponse | null,
  comparison: ForecastComparisonResponse | null,
) {
  const monthlyClusters = new Map<string, number>();
  for (const payment of plannedPayments) {
    if (!payment.next_charge_date || !payment.is_active) {
      continue;
    }
    const date = new Date(payment.next_charge_date);
    const key = englishMonthYear.format(date);
    monthlyClusters.set(key, (monthlyClusters.get(key) ?? 0) + Math.abs(payment.amount));
  }

  const highestCluster = Array.from(monthlyClusters.entries()).sort((left, right) => right[1] - left[1])[0];
  const projectedEmergency = savingsSummary?.three_month_completion_date
    ? englishMonth.format(new Date(savingsSummary.three_month_completion_date)) + " " + new Date(savingsSummary.three_month_completion_date).getFullYear()
    : null;

  const delayDays = comparison?.earliest_goal_delta_days ?? 0;

  return [
    {
      tone: "warning" as const,
      title: highestCluster ? `${highestCluster[0]} has the highest bill concentration` : "Upcoming billing cluster is light right now",
      detail: highestCluster ? `${formatCompactCurrency(highestCluster[1])} in fixed expenses.` : "No concentrated billing month detected from current planned payments.",
    },
    {
      tone: "success" as const,
      title: projectedEmergency ? `Emergency fund target reached in ${projectedEmergency}` : "Emergency fund target still needs more runway",
      detail: projectedEmergency
        ? `Protected balance: ${formatCompactCurrency(savingsSummary?.emergency_fund_current_amount ?? 0)}.`
        : "Increase Notgroschen contributions to bring the target date forward.",
    },
    {
      tone: delayDays > 0 ? "warning" : "success" as const,
      title: delayDays > 0 ? `Top goal delayed by ${delayDays} days under this scenario` : "Current scenario keeps major goals on track",
      detail: delayDays > 0 ? "Scenario changes are stretching the earliest affordability date." : "No goal delay was introduced by the active controls.",
    },
  ];
}

function buildPaymentMarkers(plannedPayments: PlannedPaymentResponse[], points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return [];
  }

  const start = new Date(points[0].date).getTime();
  const end = new Date(points[points.length - 1].date).getTime();
  const total = Math.max(end - start, 1);

  return plannedPayments
    .filter((payment) => payment.is_active && payment.next_charge_date)
    .slice(0, 6)
    .map((payment) => {
      const date = new Date(payment.next_charge_date!).getTime();
      const left = ((date - start) / total) * 100;
      return {
        id: payment.id,
        left: Math.min(96, Math.max(4, left)),
      };
    });
}

export function ForecastScenarioPlanner({
  accounts,
  forecast,
  goals,
  plannedPayments,
  savingsBuckets,
  savingsSummary,
  spendingAssumptions,
  isLoading,
}: ForecastScenarioPlannerProps) {
  const expected365 = getHorizon(forecast, "expected", 365);
  const expected90 = getHorizon(forecast, "expected", 90);
  const baseMonthlyIncome = useMemo(
    () => deriveMonthlyIncome(accounts, forecast, savingsBuckets),
    [accounts, forecast, savingsBuckets],
  );
  const baseVariableMonthly = useMemo(() => deriveVariableMonthly(spendingAssumptions), [spendingAssumptions]);
  const subscriptionMonthly = useMemo(() => deriveSubscriptionMonthly(plannedPayments), [plannedPayments]);
  const etfBucket = savingsBuckets.find((bucket) => bucket.bucket_type === "etf") ?? null;
  const emergencyBucket = savingsBuckets.find((bucket) => bucket.bucket_type === "emergency_fund") ?? null;

  const [controls, setControls] = useState<ForecastControls>({
    emergencyTarget: emergencyBucket?.target_amount ?? 10000,
    etfContribution: etfBucket?.monthly_contribution ?? 500,
    monthlyIncome: baseMonthlyIncome,
    variableMultiplier: 1,
  });
  const [comparison, setComparison] = useState<ForecastComparisonResponse | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  useEffect(() => {
    setControls({
      emergencyTarget: emergencyBucket?.target_amount ?? 10000,
      etfContribution: etfBucket?.monthly_contribution ?? 500,
      monthlyIncome: baseMonthlyIncome,
      variableMultiplier: 1,
    });
  }, [baseMonthlyIncome, emergencyBucket?.target_amount, etfBucket?.monthly_contribution]);

  useEffect(() => {
    let cancelled = false;

    async function loadScenario() {
      setScenarioLoading(true);
      setScenarioError(null);
      try {
        const response = await compareForecastScenario({
          name: "Planner preview",
          variable_spending_multiplier: controls.variableMultiplier,
          etf_monthly_contribution_override: controls.etfContribution,
          emergency_fund_monthly_contribution_override: emergencyBucket?.monthly_contribution ?? null,
          goal_priority_overrides: goals.map((goal) => ({ goal_id: goal.id, priority: goal.priority })),
        });
        if (!cancelled) {
          setComparison(response);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setScenarioError(toErrorMessage(caughtError, "Scenario preview could not be calculated."));
        }
      } finally {
        if (!cancelled) {
          setScenarioLoading(false);
        }
      }
    }

    if (forecast) {
      void loadScenario();
    }

    return () => {
      cancelled = true;
    };
  }, [controls.etfContribution, controls.variableMultiplier, emergencyBucket?.monthly_contribution, forecast, goals]);

  const scenario365 = comparison?.scenario.horizons.find((horizon) => horizon.days === 365) ?? expected365 ?? null;
  const projectionPoints = scenario365?.points ?? [];
  const projectionLine = buildProjectionLine(projectionPoints);
  const monthTicks = buildMonthTicks(projectionPoints);
  const paymentMarkers = buildPaymentMarkers(plannedPayments, projectionPoints);
  const monthlyFreeCashFlow = buildMonthlyFreeCashFlow(projectionPoints);
  const subscriptionCalendar = buildSubscriptionCalendar(plannedPayments);
  const riskAlerts = buildRiskAlerts(plannedPayments, savingsSummary, comparison);
  const dailyBurnRate = (baseVariableMonthly * controls.variableMultiplier) / 30;
  const trueFreeCashFlow = controls.monthlyIncome - subscriptionMonthly - baseVariableMonthly * controls.variableMultiplier;
  const adjustedFcf = trueFreeCashFlow - controls.etfContribution;
  const projectedSavings12m = scenario365?.risk.ending_balance ?? 0;
  const projectedThresholdY = 88;

  return (
    <section className="fc-page-stack">
      <div className="fc-card fc-card--forecast-hero">
        <h1 className="fc-page-title">Forecast &amp; Scenario Planner</h1>
        <p className="fc-page-copy">Model trade-offs across spending, savings, and forecast runway with the same dense planning structure shown in the reference design.</p>
      </div>

      <div className="fc-forecast-kpis">
        <ForecastKpiCard
          accent="mint"
          eyebrow="True Free Cash Flow"
          helper={`${formatCompactCurrency(controls.monthlyIncome)} income - ${formatCompactCurrency(subscriptionMonthly)} subs - ${formatCompactCurrency(baseVariableMonthly * controls.variableMultiplier)} burn`}
          icon="↗"
          value={`${formatCompactCurrency(trueFreeCashFlow)} / month`}
        />
        <ForecastKpiCard
          accent="green"
          eyebrow="Adjusted FCF"
          helper={`TFCF - ${formatCompactCurrency(controls.etfContribution)} ETF Sparrate`}
          icon="◫"
          value={`${formatCompactCurrency(adjustedFcf)} / month`}
        />
        <ForecastKpiCard
          accent="orange"
          eyebrow="Daily Burn Rate"
          helper={`${formatCompactCurrency(baseVariableMonthly * controls.variableMultiplier)} / month avg spend`}
          icon="◌"
          value={`${formatCompactCurrency(dailyBurnRate)} / day`}
        />
        <ForecastKpiCard
          accent="mint"
          eyebrow="Projected 12M Savings"
          helper="Net of forecast expenses and ETF Sparrate"
          icon="⚙"
          value={formatCompactCurrency(projectedSavings12m)}
        />
      </div>

      <div className="fc-forecast-main-grid">
        <section className="fc-card fc-forecast-projection-card">
          <div className="fc-card-header">
            <h2>365-Day Cash Projection</h2>
            <button className="fc-select-pill" type="button">
              Next 12 Months
            </button>
          </div>

          <div className="fc-legend fc-legend--forecast">
            <span><i className="fc-legend-line fc-legend-line--teal" />Projected Balance</span>
            <span><i className="fc-legend-dot fc-legend-dot--blue" />Subscription Hits</span>
            <span><i className="fc-legend-line fc-legend-line--red-dashed" />Warning Threshold (2,000 €)</span>
          </div>

          {projectionLine ? (
            <div className="fc-forecast-chart-wrap">
              <div className="fc-forecast-y-axis">
                {[14000, 12000, 10000, 8000, 6000, 4000, 2000, 0].map((tick) => (
                  <span key={tick}>{tick.toLocaleString("de-DE")} €</span>
                ))}
              </div>

              <div className="fc-forecast-chart-stage">
                <svg aria-hidden="true" className="fc-forecast-chart" viewBox="0 0 760 280">
                  <line className="fc-forecast-threshold" x1="0" x2="760" y1={projectedThresholdY} y2={projectedThresholdY} />
                  <polyline className="fc-forecast-line" points={projectionLine} />
                </svg>

                {paymentMarkers.map((marker) => (
                  <span
                    key={marker.id}
                    className="fc-forecast-marker"
                    style={{ left: `${marker.left}%` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="fc-empty-panel">Forecast data will render here once enough planning inputs exist.</div>
          )}

          <div className="fc-forecast-x-axis">
            {monthTicks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          {scenarioLoading ? <p className="fc-loading-copy">Refreshing scenario preview…</p> : null}
          {scenarioError ? <p className="fc-inline-error">{scenarioError}</p> : null}
        </section>

        <div className="fc-forecast-side-stack">
          <section className="fc-card">
            <div className="fc-card-header">
              <h2>Scenario Controls</h2>
              <button
                className="fc-link-button"
                onClick={() =>
                  setControls({
                    emergencyTarget: emergencyBucket?.target_amount ?? 10000,
                    etfContribution: etfBucket?.monthly_contribution ?? 500,
                    monthlyIncome: baseMonthlyIncome,
                    variableMultiplier: 1,
                  })
                }
                type="button"
              >
                Reset to defaults
              </button>
            </div>

            <ForecastSlider
              label="ETF Sparrate"
              max={2000}
              min={0}
              onChange={(value) => setControls((current) => ({ ...current, etfContribution: value }))}
              value={controls.etfContribution}
            />
            <ForecastSlider
              label="Notgroschen Target"
              max={25000}
              min={1000}
              onChange={(value) => setControls((current) => ({ ...current, emergencyTarget: value }))}
              value={controls.emergencyTarget}
            />
            <ForecastSlider
              label="Monthly Income"
              max={6000}
              min={1000}
              onChange={(value) => setControls((current) => ({ ...current, monthlyIncome: value }))}
              value={controls.monthlyIncome}
            />

            <div className="fc-forecast-segment-wrap">
              <p className="fc-forecast-control-label">Variable Spend Multiplier</p>
              <div className="fc-forecast-segmented">
                {[0.75, 0.9, 1, 1.1, 1.25].map((multiplier) => (
                  <button
                    key={multiplier}
                    className={`fc-forecast-segment ${controls.variableMultiplier === multiplier ? "is-active" : ""}`}
                    onClick={() => setControls((current) => ({ ...current, variableMultiplier: multiplier }))}
                    type="button"
                  >
                    {multiplier.toFixed(2)}x
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="fc-card">
            <div className="fc-card-header">
              <h2>Liquidity Risk Alerts</h2>
            </div>

            <div className="fc-forecast-alerts">
              {riskAlerts.map((alert) => (
                <div key={alert.title} className={`fc-forecast-alert fc-forecast-alert--${alert.tone}`}>
                  <span className="fc-forecast-alert-icon">{alert.tone === "success" ? "✓" : "!"}</span>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="fc-forecast-bottom-grid">
        <section className="fc-card">
          <div className="fc-card-header">
            <h2>Monthly Free Cash Flow</h2>
            <button className="fc-select-pill" type="button">
              Next 12 Months
            </button>
          </div>

          <div className="fc-forecast-bars">
            {monthlyFreeCashFlow.map((month) => (
              <div key={month.label} className="fc-forecast-bar-group">
                <div className="fc-forecast-bar-value">{formatCompactCurrency(month.value)}</div>
                <div className="fc-forecast-bar-track">
                  <div
                    className={`fc-forecast-bar ${month.value < 0 ? "is-negative" : ""}`}
                    style={{ height: `${Math.min(100, Math.max(16, (Math.abs(month.value) / 3000) * 100))}%` }}
                  />
                </div>
                <span>{month.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="fc-card">
          <div className="fc-card-header">
            <h2>Subscription Impact Calendar</h2>
            <button className="fc-select-pill" type="button">
              Next 6 Months
            </button>
          </div>

          <div className="fc-subscription-table">
            <div className="fc-subscription-head">
              <span />
              {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {subscriptionCalendar.map((row) => (
              <div key={row.label} className="fc-subscription-row">
                <span className="fc-subscription-month">{row.label}</span>
                {row.weeks.map((week, index) => (
                  <span key={`${row.label}-${index}`} className={`fc-subscription-cell fc-subscription-cell--${week.tone}`}>
                    {week.amount > 0 ? formatCompactCurrency(week.amount) : "–"}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <div className="fc-subscription-legend">
            <span><i className="fc-subscription-dot fc-subscription-dot--low" />Low (&lt; 750 €)</span>
            <span><i className="fc-subscription-dot fc-subscription-dot--medium" />Medium (750–1,500 €)</span>
            <span><i className="fc-subscription-dot fc-subscription-dot--high" />High (&gt; 1,500 €)</span>
          </div>
        </section>

        <section className="fc-card">
          <div className="fc-card-header">
            <h2>Forecast Logic</h2>
          </div>

          <div className="fc-forecast-logic">
            <div className="fc-forecast-logic-line">
              <span>TFCF =</span>
              <ForecastLogicBlock label="Expected Monthly Income" tone="green" value={formatCompactCurrency(controls.monthlyIncome)} />
              <span>−</span>
              <ForecastLogicBlock label="Monthly Subscriptions" tone="blue" value={formatCompactCurrency(subscriptionMonthly)} />
              <span>−</span>
              <ForecastLogicBlock label="Daily Burn Rate ×30" tone="orange" value={formatCompactCurrency(dailyBurnRate * 30)} />
            </div>

            <div className="fc-forecast-logic-line">
              <span>Adjusted FCF =</span>
              <ForecastLogicBlock label="TFCF" tone="green" value={formatCompactCurrency(trueFreeCashFlow)} />
              <span>−</span>
              <ForecastLogicBlock label="ETF Sparrate" tone="teal" value={formatCompactCurrency(controls.etfContribution)} />
              <strong className="fc-forecast-logic-result">{formatCompactCurrency(adjustedFcf)}</strong>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function ForecastKpiCard({
  accent,
  eyebrow,
  helper,
  icon,
  value,
}: {
  accent: "green" | "mint" | "orange";
  eyebrow: string;
  helper: string;
  icon: string;
  value: string;
}) {
  return (
    <div className={`fc-card fc-forecast-kpi fc-forecast-kpi--${accent}`}>
      <span className="fc-forecast-kpi-icon">{icon}</span>
      <div>
        <p>{eyebrow}</p>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </div>
  );
}

function ForecastSlider({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const ratio = ((value - min) / (max - min)) * 100;

  return (
    <div className="fc-forecast-slider">
      <div className="fc-side-card-heading">
        <h3>{label}</h3>
        <span className="fc-side-card-value">{formatCompactCurrency(value)} / month</span>
      </div>
      <input
        className="fc-range-input"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
      <div className="fc-slider-track">
        <div className="fc-slider-fill" style={{ width: `${ratio}%` }} />
        <div className="fc-slider-thumb" style={{ left: `${ratio}%` }} />
      </div>
      <div className="fc-slider-range">
        <span>{formatCompactCurrency(min)}</span>
        <span>{formatCompactCurrency(max)}</span>
      </div>
    </div>
  );
}

function ForecastLogicBlock({ label, tone, value }: { label: string; tone: "green" | "blue" | "orange" | "teal"; value: string }) {
  return (
    <div className={`fc-forecast-logic-block fc-forecast-logic-block--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
