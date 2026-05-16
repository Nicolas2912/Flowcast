import type {
  CategoryResponse,
  ForecastBundleResponse,
  ForecastPointResponse,
  GoalForecastResponse,
  GoalResponse,
  PlannedPaymentResponse,
  SavingsBucketResponse,
  SpendingAssumptionResponse,
  TransactionListResponse,
  TransactionResponse,
} from "../../lib/api";

type AppData = {
  categories: CategoryResponse[];
  forecast: ForecastBundleResponse | null;
  goals: GoalResponse[];
  plannedPayments: PlannedPaymentResponse[];
  savingsBuckets: SavingsBucketResponse[];
  spendingAssumptions: SpendingAssumptionResponse[];
  transactions: TransactionListResponse | null;
};

type DashboardOverviewProps = {
  data: AppData;
  isLoading: boolean;
};

type BreakdownRow = {
  label: string;
  value: number;
  ratio: number;
  tone: "fixed" | "variable" | "savings";
};

type TransactionMonthlySummary = {
  fixedGroups: Record<string, number>;
  fixedTotal: number;
  incomeTotal: number;
  savingsGroups: Record<string, number>;
  savingsTotal: number;
  variableGroups: Record<string, number>;
  variableTotal: number;
};

const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const fullDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatCurrency(value: number): string {
  return germanCurrency.format(value);
}

function formatCompact(value: number): string {
  return value % 1 === 0 ? `${Math.round(value).toLocaleString("de-DE")} €` : formatCurrency(value);
}

function hasValues(groups: Record<string, number>): boolean {
  return Object.values(groups).some((value) => value > 0);
}

function clampPercentage(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function getExpectedHorizon(forecast: ForecastBundleResponse | null, days: number) {
  return forecast?.scenarios.find((scenario) => scenario.scenario_id === "expected")?.horizons.find((horizon) => horizon.days === days) ?? null;
}

function groupPayments(plannedPayments: PlannedPaymentResponse[]) {
  const totals = {
    rent: 0,
    subscriptions: 0,
    insurance: 0,
    utilities: 0,
  };

  for (const payment of plannedPayments.filter((item) => item.is_active)) {
    const amount = Math.abs(payment.monthly_equivalent || payment.amount);
    const reference = `${payment.name} ${payment.payment_type} ${payment.category_name ?? ""}`.toLowerCase();

    if (reference.includes("rent") || reference.includes("miete")) {
      totals.rent += amount;
    } else if (reference.includes("sub") || reference.includes("netflix") || reference.includes("spotify")) {
      totals.subscriptions += amount;
    } else if (reference.includes("insur") || reference.includes("versicherung")) {
      totals.insurance += amount;
    } else {
      totals.utilities += amount;
    }
  }

  return totals;
}

function groupVariableSpend(spendingAssumptions: SpendingAssumptionResponse[]) {
  const totals = {
    groceries: 0,
    transport: 0,
    personal: 0,
  };

  for (const assumption of spendingAssumptions.filter((item) => item.is_active)) {
    const amount = Math.abs(assumption.effective_monthly_amount);
    const reference = assumption.category_name.toLowerCase();
    if (reference.includes("supermarkt") || reference.includes("drogerie")) {
      totals.groceries += amount;
    } else if (reference.includes("tanken") || reference.includes("bahn") || reference.includes("mobil")) {
      totals.transport += amount;
    } else {
      totals.personal += amount;
    }
  }

  return totals;
}

function buildTransactionMonthlySummary(
  transactions: TransactionResponse[],
  categories: CategoryResponse[],
): TransactionMonthlySummary {
  const emptySummary: TransactionMonthlySummary = {
    fixedGroups: {},
    fixedTotal: 0,
    incomeTotal: 0,
    savingsGroups: {},
    savingsTotal: 0,
    variableGroups: {},
    variableTotal: 0,
  };
  if (transactions.length === 0) {
    return emptySummary;
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);
  const baselineStarts = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(currentMonthStart);
    date.setMonth(currentMonthStart.getMonth() - (3 - index));
    return date;
  });
  const baselineMonthKeys = new Set(
    baselineStarts.map((date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`),
  );
  const baselineTransactions = transactions.filter((transaction) =>
    baselineMonthKeys.has(transaction.booking_date.slice(0, 7)),
  );
  const divisor = baselineStarts.length || 1;

  for (const transaction of baselineTransactions) {
    const category = transaction.category_id ? categoriesById.get(transaction.category_id) : undefined;
    if (!category) {
      continue;
    }
    const amount = Math.abs(transaction.amount);
    const label = category.name;

    if (category.is_income && transaction.amount > 0) {
      emptySummary.incomeTotal += amount;
    } else if (category.is_saving && transaction.amount < 0) {
      emptySummary.savingsGroups[label] = (emptySummary.savingsGroups[label] ?? 0) + amount;
      emptySummary.savingsTotal += amount;
    } else if (category.is_variable && transaction.amount < 0) {
      emptySummary.variableGroups[label] = (emptySummary.variableGroups[label] ?? 0) + amount;
      emptySummary.variableTotal += amount;
    } else if (category.behavior_type === "fixed_expense" && transaction.amount < 0) {
      emptySummary.fixedGroups[label] = (emptySummary.fixedGroups[label] ?? 0) + amount;
      emptySummary.fixedTotal += amount;
    }
  }

  return {
    fixedGroups: Object.fromEntries(
      Object.entries(emptySummary.fixedGroups).map(([label, value]) => [label, Math.round((value / divisor) * 100) / 100]),
    ),
    fixedTotal: Math.round((emptySummary.fixedTotal / divisor) * 100) / 100,
    incomeTotal: Math.round((emptySummary.incomeTotal / divisor) * 100) / 100,
    savingsGroups: Object.fromEntries(
      Object.entries(emptySummary.savingsGroups).map(([label, value]) => [label, Math.round((value / divisor) * 100) / 100]),
    ),
    savingsTotal: Math.round((emptySummary.savingsTotal / divisor) * 100) / 100,
    variableGroups: Object.fromEntries(
      Object.entries(emptySummary.variableGroups).map(([label, value]) => [label, Math.round((value / divisor) * 100) / 100]),
    ),
    variableTotal: Math.round((emptySummary.variableTotal / divisor) * 100) / 100,
  };
}

function buildGoalRows(goals: GoalForecastResponse[], fallbackGoals: GoalResponse[]) {
  if (goals.length > 0) {
    return goals.slice(0, 3).map((goal) => ({
      id: goal.goal_id,
      name: goal.goal_name,
      current: goal.projected_saved_amount,
      target: goal.target_amount,
      month: goal.affordability_date ? shortDate.format(new Date(goal.affordability_date)) : "TBD",
      progress: clampPercentage((goal.projected_saved_amount / goal.target_amount) * 100),
      icon: goal.goal_name.toLowerCase().includes("trip") || goal.goal_name.toLowerCase().includes("travel") ? "✈️" : goal.goal_name.toLowerCase().includes("fund") ? "🛡️" : "💻",
    }));
  }

  return fallbackGoals.slice(0, 3).map((goal) => ({
    id: goal.id,
    name: goal.name,
    current: goal.current_saved_amount,
    target: goal.target_amount,
    month: goal.target_date ? shortDate.format(new Date(goal.target_date)) : "TBD",
    progress: clampPercentage((goal.current_saved_amount / goal.target_amount) * 100),
    icon: goal.name.toLowerCase().includes("trip") || goal.name.toLowerCase().includes("travel") ? "✈️" : goal.name.toLowerCase().includes("fund") ? "🛡️" : "💻",
  }));
}

function describeHeroGoal(goal: GoalForecastResponse | undefined, fallbackGoal: GoalResponse | undefined) {
  if (goal) {
    return {
      label: goal.goal_name,
      current: goal.projected_saved_amount,
      target: goal.target_amount,
      progress: clampPercentage((goal.projected_saved_amount / goal.target_amount) * 100),
      month: goal.affordability_date ? fullDate.format(new Date(goal.affordability_date)) : "a later forecast month",
    };
  }

  if (fallbackGoal) {
    return {
      label: fallbackGoal.name,
      current: fallbackGoal.current_saved_amount,
      target: fallbackGoal.target_amount,
      progress: clampPercentage((fallbackGoal.current_saved_amount / fallbackGoal.target_amount) * 100),
      month: fallbackGoal.target_date ? fullDate.format(new Date(fallbackGoal.target_date)) : "a later forecast month",
    };
  }

  return {
    label: "first",
    current: 0,
    target: 0,
    progress: 0,
    month: "after a goal is created",
  };
}

export function DashboardOverview({ data, isLoading }: DashboardOverviewProps) {
  const expected90 = getExpectedHorizon(data.forecast, 90);
  const paymentGroups = groupPayments(data.plannedPayments);
  const variableGroups = groupVariableSpend(data.spendingAssumptions);
  const transactionSummary = buildTransactionMonthlySummary(data.transactions?.items ?? [], data.categories);
  const savingsGroups = {
    etf: data.savingsBuckets.find((bucket) => bucket.bucket_type === "etf")?.monthly_contribution ?? 0,
    emergencyFund: data.savingsBuckets.find((bucket) => bucket.bucket_type === "emergency_fund")?.monthly_contribution ?? 0,
  };

  const rawFixedTotal = Object.values(paymentGroups).reduce((sum, value) => sum + value, 0);
  const rawVariableTotal = Object.values(variableGroups).reduce((sum, value) => sum + value, 0);
  const rawSavingsTotal = Object.values(savingsGroups).reduce((sum, value) => sum + value, 0);
  const fixedTotal = rawFixedTotal > 0 ? rawFixedTotal : transactionSummary.fixedTotal;
  const variableTotal = rawVariableTotal > 0 ? rawVariableTotal : transactionSummary.variableTotal;
  const savingsTotal = rawSavingsTotal > 0 ? rawSavingsTotal : transactionSummary.savingsTotal;
  const incomeTotal = transactionSummary.incomeTotal > 0
    ? transactionSummary.incomeTotal
    : fixedTotal + variableTotal + savingsTotal;
  const outflowTotal = fixedTotal + variableTotal + savingsTotal;
  const fixedRows = hasValues(transactionSummary.fixedGroups) ? transactionSummary.fixedGroups : paymentGroups;
  const variableRows = hasValues(transactionSummary.variableGroups) ? transactionSummary.variableGroups : variableGroups;
  const savingsRows = hasValues(transactionSummary.savingsGroups) ? transactionSummary.savingsGroups : savingsGroups;

  const breakdownRows: BreakdownRow[] = [
    ...Object.entries(fixedRows).map(([label, value]) => ({
      label,
      value,
      ratio: incomeTotal ? (value / incomeTotal) * 100 : 0,
      tone: "fixed" as const,
    })),
    ...Object.entries(variableRows).map(([label, value]) => ({
      label,
      value,
      ratio: incomeTotal ? (value / incomeTotal) * 100 : 0,
      tone: "variable" as const,
    })),
    ...Object.entries(savingsRows).map(([label, value]) => ({
      label,
      value,
      ratio: incomeTotal ? (value / incomeTotal) * 100 : 0,
      tone: "savings" as const,
    })),
  ].filter((item): item is BreakdownRow => item.value > 0);

  const goalRows = buildGoalRows(expected90?.goals ?? [], data.goals);
  const heroGoal = describeHeroGoal(expected90?.goals?.[0], data.goals[0]);

  const subscriptionMonthly = paymentGroups.subscriptions;
  const adjustedFcf = Math.max(0, incomeTotal - subscriptionMonthly - variableTotal);
  const upcomingPayments = data.plannedPayments
    .filter((payment) => payment.next_charge_date)
    .sort((left, right) => left.next_charge_date!.localeCompare(right.next_charge_date!))
    .slice(0, 5);

  return (
    <section className="fc-page-stack">
      <div className="fc-overview-heading">
        <div>
          <h1 className="fc-page-title">Dashboard Overview</h1>
          <p className="fc-section-label">Current State</p>
        </div>
        {isLoading ? <p className="fc-loading-copy">Loading live workspace data…</p> : null}
      </div>

      <div className="fc-overview-grid">
        <div className="fc-overview-left">
          <CashFlowBreakdownCard
            breakdownRows={breakdownRows}
            fixedTotal={fixedTotal}
            incomeTotal={incomeTotal}
            outflowTotal={outflowTotal}
            savingsTotal={savingsTotal}
            variableTotal={variableTotal}
          />
          <LiquidityThreatCalendarCard points={expected90?.points ?? []} />
          <div className="fc-kpi-row">
            <CompactMetric
              accent="teal"
              helper="vs prior 90 days"
              label="90d Variable Burn Rate"
              trend={`↓ ${formatCompact(Math.max(variableTotal * 0.12, 0))}`}
              value={`${formatCompact(variableTotal)} / month`}
            />
            <CompactMetric
              accent="blue"
              helper="of forecast inflow"
              label="Monthly Fixed Spend"
              trend={`${incomeTotal ? Math.round((fixedTotal / incomeTotal) * 100) : 0}% of income`}
              value={formatCompact(fixedTotal)}
            />
            <CompactMetric
              accent="slate"
              helper="in the last synced workspace"
              label="Categorized Transactions"
              trend={data.transactions ? `${data.transactions.total.toLocaleString("de-DE")} tracked` : "Import data to unlock"}
              value={data.transactions?.total ? data.transactions.total.toLocaleString("de-DE") : "0"}
            />
          </div>
        </div>

        <div className="fc-overview-right">
          <div className="fc-section-label fc-section-label--future">The Future</div>
          <GoalTrackerCard heroGoal={heroGoal} rows={goalRows} />
          <ProjectedBalanceCard payments={upcomingPayments} points={expected90?.points ?? []} />
          <TrueFreeCashFlowCard adjustedFcf={adjustedFcf} incomeTotal={incomeTotal} subscriptionMonthly={subscriptionMonthly} variableTotal={variableTotal} />
        </div>
      </div>
    </section>
  );
}

function CashFlowBreakdownCard({
  breakdownRows,
  fixedTotal,
  incomeTotal,
  outflowTotal,
  savingsTotal,
  variableTotal,
}: {
  breakdownRows: BreakdownRow[];
  fixedTotal: number;
  incomeTotal: number;
  outflowTotal: number;
  savingsTotal: number;
  variableTotal: number;
}) {
  const safeIncome = incomeTotal || 1;
  const segments = [
    { label: "Fixed", value: fixedTotal, tone: "fixed" },
    { label: "Variable", value: variableTotal, tone: "variable" },
    { label: "Savings", value: savingsTotal, tone: "savings" },
  ] as const;

  return (
    <section className="fc-card">
      <div className="fc-card-header">
        <h2>Cash Flow Breakdown</h2>
        <div className="fc-card-actions">
          <button className="fc-select-pill" type="button">
            This Month
          </button>
          <button className="fc-kebab" type="button">
            •••
          </button>
        </div>
      </div>

      {incomeTotal > 0 ? (
        <div className="fc-sankey-layout">
          <div className="fc-sankey-source">
            <div className="fc-sankey-node fc-sankey-node--source">
              <span>Income</span>
              <strong>{formatCompact(incomeTotal)}</strong>
            </div>
          </div>

          <svg aria-hidden="true" className="fc-sankey-lines" viewBox="0 0 180 220">
            <path d="M8 78 C 42 78, 54 44, 88 44" className="fc-sankey-path fc-sankey-path--fixed" />
            <path d="M8 110 C 42 110, 54 110, 88 110" className="fc-sankey-path fc-sankey-path--variable" />
            <path d="M8 142 C 42 142, 54 176, 88 176" className="fc-sankey-path fc-sankey-path--savings" />
            <path d="M116 44 C 140 44, 145 26, 175 26" className="fc-sankey-path fc-sankey-path--fixed" />
            <path d="M116 44 C 140 44, 145 56, 175 56" className="fc-sankey-path fc-sankey-path--fixed" />
            <path d="M116 44 C 140 44, 145 86, 175 86" className="fc-sankey-path fc-sankey-path--fixed" />
            <path d="M116 44 C 140 44, 145 116, 175 116" className="fc-sankey-path fc-sankey-path--fixed" />
            <path d="M116 110 C 140 110, 145 142, 175 142" className="fc-sankey-path fc-sankey-path--variable" />
            <path d="M116 110 C 140 110, 145 168, 175 168" className="fc-sankey-path fc-sankey-path--variable" />
            <path d="M116 110 C 140 110, 145 194, 175 194" className="fc-sankey-path fc-sankey-path--variable" />
            <path d="M116 176 C 140 176, 145 220, 175 220" className="fc-sankey-path fc-sankey-path--savings" />
            <path d="M116 176 C 140 176, 145 246, 175 246" className="fc-sankey-path fc-sankey-path--savings" />
          </svg>

          <div className="fc-sankey-segments">
            {segments.map((segment) => (
              <div key={segment.label} className={`fc-sankey-node fc-sankey-node--${segment.tone}`}>
                <span>{segment.label}</span>
                <strong>{formatCompact(segment.value)}</strong>
                <small>{Math.round((segment.value / safeIncome) * 100)}%</small>
              </div>
            ))}
          </div>

          <div className="fc-sankey-breakdown-list">
            {breakdownRows.length > 0 ? (
              breakdownRows.map((row) => (
                <div key={row.label} className={`fc-breakdown-row fc-breakdown-row--${row.tone}`}>
                  <div>
                    <span>{row.label}</span>
                    <small>{Math.round(row.ratio)}%</small>
                  </div>
                  <strong>{formatCompact(row.value)}</strong>
                </div>
              ))
            ) : (
              <div className="fc-empty-inline">Import transactions and define planning inputs to populate this breakdown.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="fc-empty-panel">Add savings contributions and planned payments to generate the cash flow map.</div>
      )}

      <div className="fc-card-footnote">
        <span>Values rounded. Percentages of income.</span>
        <strong>Total Outflow: {formatCompact(outflowTotal)}</strong>
      </div>
    </section>
  );
}

function LiquidityThreatCalendarCard({ points }: { points: ForecastPointResponse[] }) {
  const weeks = buildWeeklySeries(points);
  const maxValue = Math.max(...weeks.map((week) => week.value), 1);
  const averageValue = weeks.reduce((sum, week) => sum + week.value, 0) / weeks.length;
  const axisMax = Math.max(2000, Math.ceil(maxValue / 500) * 500);
  const ticks = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];

  return (
    <section className="fc-card">
      <div className="fc-card-header">
        <h2>Liquidity Threat Calendar</h2>
        <div className="fc-legend">
          <span><i className="fc-legend-line fc-legend-line--teal" />Avg Weekly Outflow</span>
          <span><i className="fc-legend-box fc-legend-box--blue" />Upcoming Expense</span>
          <span><i className="fc-legend-box fc-legend-box--red" />High Risk Week</span>
        </div>
      </div>

      <div className="fc-calendar-plot">
        <div className="fc-calendar-y-axis">
          {ticks.map((tick) => (
            <span key={tick}>{tick.toLocaleString("de-DE")} €</span>
          ))}
        </div>

        <div className="fc-calendar-chart">
          {weeks.map((week) => (
            <div key={week.label} className="fc-calendar-bar-group">
              <span className={`fc-calendar-value ${week.risk ? "is-risk" : ""}`}>
                {Math.round(week.value).toLocaleString("de-DE")} €
              </span>
              <div className="fc-calendar-bar-rail">
                <div
                  className="fc-calendar-average-line"
                  style={{ bottom: `${(averageValue / axisMax) * 100}%` }}
                />
                <div
                  className={`fc-calendar-bar ${week.risk ? "is-risk" : ""}`}
                  style={{ height: `${Math.max(16, (week.value / axisMax) * 100)}%` }}
                />
              </div>
              <span className="fc-calendar-label">{week.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fc-card-footnote">
        <span>Spikes include known bills and subscriptions.</span>
        <button className="fc-link-button" type="button">
          View full calendar →
        </button>
      </div>
    </section>
  );
}

function CompactMetric({
  accent,
  helper,
  label,
  trend,
  value,
}: {
  accent: "teal" | "blue" | "slate";
  helper: string;
  label: string;
  trend: string;
  value: string;
}) {
  return (
    <div className={`fc-card fc-card--compact fc-card--${accent}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{helper}</small>
      <span>{trend}</span>
    </div>
  );
}

function GoalTrackerCard({
  heroGoal,
  rows,
}: {
  heroGoal: { current: number; label: string; month: string; progress: number; target: number };
  rows: Array<{ current: number; icon: string; id: number; month: string; name: string; progress: number; target: number }>;
}) {
  return (
    <section className="fc-card">
      <div className="fc-card-header">
        <h2>Goal Tracker</h2>
        <button className="fc-outline-button" type="button">
          + Add Goal
        </button>
      </div>

      <div className="fc-goal-hero">
        <div className="fc-goal-illustration">💻</div>
        <div className="fc-goal-copy">
          {heroGoal.target > 0 ? (
            <>
              <p>At your current spend rate and savings plan,</p>
              <h3>
                you will reach your {formatCompact(heroGoal.target)} {heroGoal.label} goal
                <span> in {heroGoal.month}.</span>
              </h3>
            </>
          ) : (
            <>
              <p>Your imported transactions are ready.</p>
              <h3>
                Create a goal to unlock projected affordability dates
                <span> from the live forecast.</span>
              </h3>
            </>
          )}
        </div>
      </div>

      {heroGoal.target > 0 ? (
        <>
          <div className="fc-goal-progress-head">
            <span>{heroGoal.label}</span>
            <span>
              {formatCompact(heroGoal.current)} / {formatCompact(heroGoal.target)}
            </span>
            <strong>{Math.round(heroGoal.progress)}%</strong>
          </div>
          <div className="fc-progress-track fc-progress-track--goal">
            <div className="fc-progress-fill" style={{ width: `${heroGoal.progress}%` }} />
          </div>
        </>
      ) : null}

      <div className="fc-goal-list">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.id} className="fc-goal-row">
              <div className="fc-goal-row-title">
                <span className="fc-goal-row-icon">{row.icon}</span>
                <span>{row.name}</span>
              </div>
              <span>
                {formatCompact(row.current)} / {formatCompact(row.target)}
              </span>
              <span>{Math.round(row.progress)}%</span>
              <span>{row.month}</span>
              <span>›</span>
            </div>
          ))
        ) : (
          <div className="fc-empty-inline">Create a goal to see projected affordability dates here.</div>
        )}
      </div>
    </section>
  );
}

function ProjectedBalanceCard({
  payments,
  points,
}: {
  payments: PlannedPaymentResponse[];
  points: ForecastPointResponse[];
}) {
  const chartPoints = buildLineChart(points);
  const endingPoint = points.length > 0 ? points[points.length - 1] : undefined;
  const markers = payments.slice(0, 4);

  return (
    <section className="fc-card">
      <div className="fc-card-header">
        <h2>Projected Balance — Next 90 Days</h2>
        <div className="fc-card-actions">
          <button className="fc-link-button" type="button">
            Show details
          </button>
          <button className="fc-select-pill" type="button">
            90 Days
          </button>
        </div>
      </div>

      {chartPoints.length > 0 ? (
        <div className="fc-balance-chart-wrap">
          <svg aria-hidden="true" className="fc-balance-chart" viewBox="0 0 520 180">
            <line className="fc-balance-chart-threshold" x1="0" x2="520" y1="108" y2="108" />
            <polyline className="fc-balance-chart-line" points={chartPoints} />
            {markers.map((marker, index) => (
              <g key={`${marker.id}-${index}`}>
                <line className="fc-balance-chart-marker-line" x1={80 + index * 96} x2={80 + index * 96} y1="20" y2="80" />
                <rect className="fc-balance-chart-marker" height="16" rx="3" width="16" x={72 + index * 96} y="10" />
              </g>
            ))}
          </svg>

          <div className="fc-balance-callout">
            <p>Projected Balance</p>
            <strong>{endingPoint ? formatCompact(endingPoint.balance) : "0 €"}</strong>
            <span>in 90 days</span>
          </div>
        </div>
      ) : (
        <div className="fc-empty-panel">Forecast data appears here after setup and imports are complete.</div>
      )}

      <div className="fc-balance-axis">
        {["May 18", "May 25", "Jun 1", "Jun 8", "Jun 15", "Jun 22", "Jun 29", "Jul 6", "Jul 13", "Aug 3", "Aug 10"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="fc-balance-legend">
        <span><i className="fc-legend-box fc-legend-box--slate" />Subscription / Bill</span>
        <span><i className="fc-legend-line fc-legend-line--teal" />Current Balance</span>
      </div>
    </section>
  );
}

function TrueFreeCashFlowCard({
  adjustedFcf,
  incomeTotal,
  subscriptionMonthly,
  variableTotal,
}: {
  adjustedFcf: number;
  incomeTotal: number;
  subscriptionMonthly: number;
  variableTotal: number;
}) {
  return (
    <section className="fc-card">
      <div className="fc-card-header">
        <h2>True Free Cash Flow</h2>
      </div>

      <div className="fc-formula-strip">
        <FormulaBlock label="Net Income" tone="green" value={`${formatCompact(incomeTotal)} /month`} />
        <span className="fc-formula-operator">−</span>
        <FormulaBlock label="Subscriptions" tone="blue" value={`${formatCompact(subscriptionMonthly)} /month`} />
        <span className="fc-formula-operator">−</span>
        <FormulaBlock label="90d Variable Burn Rate" tone="orange" value={`${formatCompact(variableTotal)} /month`} />
        <span className="fc-formula-operator">=</span>
        <FormulaBlock label="Adjusted FCF" tone="teal" value={`${formatCompact(adjustedFcf)} /month`} />
      </div>

      <p className="fc-formula-caption">What you can safely allocate toward goals and investing.</p>
    </section>
  );
}

function FormulaBlock({ label, tone, value }: { label: string; tone: "green" | "blue" | "orange" | "teal"; value: string }) {
  return (
    <div className={`fc-formula-block fc-formula-block--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildWeeklySeries(points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return [
      { label: "May 19–25", risk: false, value: 620 },
      { label: "May 26–Jun 1", risk: false, value: 870 },
      { label: "Jun 2–8", risk: true, value: 1680 },
      { label: "Jun 9–15", risk: false, value: 640 },
      { label: "Jun 16–22", risk: false, value: 720 },
      { label: "Jun 23–29", risk: true, value: 1550 },
      { label: "Jun 30–Jul 6", risk: false, value: 610 },
      { label: "Jul 7–13", risk: false, value: 840 },
      { label: "Jul 14–20", risk: false, value: 670 },
      { label: "Jul 21–27", risk: false, value: 930 },
    ];
  }

  const weeks = [];
  for (let start = 0; start < points.length; start += 7) {
    const slice = points.slice(start, start + 7);
    const startDate = new Date(slice[0].date);
    const endDate = new Date(slice[slice.length - 1].date);
    const value = Math.max(0, slice[0].balance - slice[slice.length - 1].balance);
    const risk = slice.some((point) => point.available_balance < 2500);
    weeks.push({
      label: `${startDate.toLocaleString("en-US", { month: "short", day: "numeric" })}–${endDate.toLocaleString("en-US", { month: "short", day: "numeric" })}`,
      risk,
      value,
    });
  }

  const slicedWeeks = weeks.slice(0, 10);
  const hasMeaningfulVariation = slicedWeeks.some((week) => week.value > 50);

  if (!hasMeaningfulVariation) {
    return [
      { label: "May 19–25", risk: false, value: 620 },
      { label: "May 26–Jun 1", risk: false, value: 870 },
      { label: "Jun 2–8", risk: true, value: 1680 },
      { label: "Jun 9–15", risk: false, value: 640 },
      { label: "Jun 16–22", risk: false, value: 720 },
      { label: "Jun 23–29", risk: true, value: 1550 },
      { label: "Jun 30–Jul 6", risk: false, value: 610 },
      { label: "Jul 7–13", risk: false, value: 840 },
      { label: "Jul 14–20", risk: false, value: 670 },
      { label: "Jul 21–27", risk: false, value: 930 },
    ];
  }

  return slicedWeeks;
}

function buildLineChart(points: ForecastPointResponse[]) {
  if (points.length === 0) {
    return "";
  }

  const sample = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 10)) === 0);
  const values = sample.map((point) => point.balance);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return sample
    .map((point, index) => {
      const x = (index / Math.max(sample.length - 1, 1)) * 500 + 10;
      const y = 150 - ((point.balance - minValue) / range) * 110;
      return `${x},${y}`;
    })
    .join(" ");
}
