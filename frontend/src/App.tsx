import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ChartCandlestick } from "lucide-react";

import { ForecastWorkspace } from "./components/forecast/forecast-workspace";
import { HealthCard } from "./components/health-card";
import { ImportPanel } from "./components/import/import-panel";
import { PlanningWorkspace } from "./components/planning/planning-workspace";
import { SavingsWorkspace } from "./components/savings/savings-workspace";
import { TransactionWorkspace } from "./components/transactions/transaction-workspace";
import {
  fetchForecast,
  fetchGoals,
  fetchHealth,
  fetchImports,
  fetchSpendingAssumptions,
  HttpError,
  type ForecastBundleResponse,
  type GoalResponse,
  type HealthResponse,
  type ImportBatchResponse,
  type SpendingAssumptionResponse,
} from "./lib/api";

const currency = new Intl.NumberFormat("de-DE", {
  currency: "EUR",
  style: "currency",
});

const asOfDate = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inputs", label: "Inputs" },
  { id: "transactions", label: "Transactions" },
  { id: "planning", label: "Planning" },
  { id: "savings", label: "Savings" },
  { id: "forecast", label: "Forecast" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const fallbackCategories = [
  { label: "Miete", value: 805.66, share: 17, tone: "bucket-fixed" },
  { label: "Supermarkt", value: 226.91, share: 6, tone: "bucket-variable" },
  { label: "Freizeit", value: 147.78, share: 4, tone: "bucket-variable" },
  { label: "Reisen", value: 137.8, share: 4, tone: "bucket-variable" },
  { label: "Nebenkosten", value: 121.13, share: 3, tone: "bucket-fixed" },
];

const fallbackGoalRows = [
  { icon: "💻", name: "Laptop", progress: 70, saved: "1,050 €", target: "1,500 €", targetDate: "Aug 2026" },
  { icon: "✈️", name: "Canada Trip", progress: 40, saved: "1,200 €", target: "3,000 €", targetDate: "Jun 2027" },
  { icon: "🛡️", name: "Emergency Fund", progress: 62, saved: "6,200 €", target: "10,000 €", targetDate: "Mar 2026" },
];

const weeklyOutflows = [620, 870, 1680, 640, 720, 1550, 610, 840, 670, 930];
const balanceSeries = [8600, 8500, 8300, 8000, 7600, 7200, 8400, 8350, 8300, 8200, 7800, 7600, 7800, 7700, 7400, 6900, 8150, 8000, 7900, 7600, 7200, 7000, 6900, 6500, 6250, 6000, 7600, 7350, 7100, 6800, 6350, 6100, 6200, 5900, 5650, 5420];
const billMarkerIndexes = [5, 16, 22, 26];

function expectedHorizon(forecast: ForecastBundleResponse | null) {
  return forecast?.scenarios.find((scenario) => scenario.scenario_id === "expected")?.horizons.find((horizon) => horizon.days === 90) ?? null;
}

function compactCurrency(value: number) {
  return currency.format(value).replace(",00", "");
}

function compactEuro(value: number) {
  return `${new Intl.NumberFormat("de-DE").format(value)} €`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(date);
}

function dateRangeLabel(start: Date, end: Date) {
  const startLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(start);
  const sameMonth = start.getMonth() === end.getMonth();
  const endLabel = new Intl.DateTimeFormat("en-US", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }).format(end);

  return `${startLabel}-${endLabel}`;
}

function goalIcon(goal: GoalResponse) {
  const name = goal.name.toLowerCase();
  if (name.includes("trip") || name.includes("travel") || name.includes("canada") || goal.goal_type === "travel") {
    return "✈️";
  }
  if (name.includes("emergency") || name.includes("notgroschen") || goal.goal_type === "emergency") {
    return "🛡️";
  }
  return "💻";
}

function goalTargetDateLabel(targetDate: string | null) {
  if (!targetDate) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(targetDate));
}

function goalToOverviewRow(goal: GoalResponse) {
  const progress = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_saved_amount / goal.target_amount) * 100)) : 0;

  return {
    icon: goalIcon(goal),
    name: goal.name,
    progress,
    saved: compactCurrency(goal.current_saved_amount),
    target: compactCurrency(goal.target_amount),
    targetDate: goalTargetDateLabel(goal.target_date),
  };
}

function toErrorMessage(caughtError: unknown): string {
  if (caughtError instanceof HttpError) {
    return `${caughtError.payload.error.message} (${caughtError.payload.error.code})`;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return "The backend request failed.";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportBatchResponse[]>([]);
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [forecast, setForecast] = useState<ForecastBundleResponse | null>(null);
  const [assumptions, setAssumptions] = useState<SpendingAssumptionResponse[]>([]);

  async function loadHealth() {
    setHealthLoading(true);
    setHealthError(null);

    try {
      setHealth(await fetchHealth());
    } catch (caughtError) {
      setHealthError(toErrorMessage(caughtError));
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
    void Promise.allSettled([fetchImports(), fetchGoals(), fetchForecast(), fetchSpendingAssumptions()]).then(
      ([importResult, goalResult, forecastResult, assumptionResult]) => {
        if (importResult.status === "fulfilled") {
          setImports(importResult.value);
        }
        if (goalResult.status === "fulfilled") {
          setGoals(goalResult.value);
        }
        if (forecastResult.status === "fulfilled") {
          setForecast(forecastResult.value);
        }
        if (assumptionResult.status === "fulfilled") {
          setAssumptions(assumptionResult.value);
        }
      },
    );
  }, []);

  return (
    <div className={`flowcast-app ${activeTab === "dashboard" ? "dashboard-mode" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <LogoMark />
          <div>
            <strong>Predictive Personal Finance Engine</strong>
            <span>Forecast cash flow, track goals, and predict liquidity risks</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span>Data as of {asOfDate}</span>
          <button type="button" onClick={() => void loadHealth()} aria-label="Refresh dashboard">↻</button>
        </div>
      </header>

      <div className="app-frame">
        <aside className="side-nav" aria-label="Main sections">
          <div className="side-nav-title">{activeTab === "dashboard" ? "Inputs" : "Flowcast"}</div>
          {activeTab === "dashboard" ? <DashboardInputRail importedRows={imports[0]?.transaction_count ?? 0} /> : null}
          <div className="section-nav">
          {tabs.map((tab) => (
            <button
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
          </div>
        </aside>

        <main className={activeTab === "dashboard" ? "dashboard-content" : "workspace-content"}>
          {activeTab === "dashboard" ? (
            <DashboardOverview
              assumptions={assumptions}
              forecast={forecast}
              goals={goals}
              health={health}
              healthError={healthError}
              healthLoading={healthLoading}
              imports={imports}
              onRetryHealth={() => void loadHealth()}
            />
          ) : null}
          {activeTab === "inputs" ? <LegacyWorkspace><ImportPanel /></LegacyWorkspace> : null}
          {activeTab === "transactions" ? <LegacyWorkspace><TransactionWorkspace /></LegacyWorkspace> : null}
          {activeTab === "planning" ? <LegacyWorkspace><PlanningWorkspace /></LegacyWorkspace> : null}
          {activeTab === "savings" ? <LegacyWorkspace><SavingsWorkspace /></LegacyWorkspace> : null}
          {activeTab === "forecast" ? <LegacyWorkspace><ForecastWorkspace /></LegacyWorkspace> : null}
        </main>
      </div>
    </div>
  );
}

function DashboardOverview({
  assumptions,
  forecast,
  goals,
  health,
  healthError,
  healthLoading,
  imports,
  onRetryHealth,
}: {
  assumptions: SpendingAssumptionResponse[];
  forecast: ForecastBundleResponse | null;
  goals: GoalResponse[];
  health: HealthResponse | null;
  healthError: string | null;
  healthLoading: boolean;
  imports: ImportBatchResponse[];
  onRetryHealth: () => void;
}) {
  const horizon = expectedHorizon(forecast);
  const importedRows = imports[0]?.transaction_count ?? 0;
  const projectedBalance = horizon?.risk.ending_balance ?? 0;
  const lowestBalance = horizon?.risk.minimum_balance ?? 0;
  const activeGoals = goals.filter((goal) => goal.is_active);
  const goalRows = activeGoals.length > 0 ? activeGoals.slice(0, 3).map(goalToOverviewRow) : fallbackGoalRows;
  const featuredGoal = goalRows[0];
  const categories = useMemo(() => {
    if (assumptions.length === 0) {
      return fallbackCategories;
    }

    return assumptions.slice(0, 5).map((assumption) => ({
      label: assumption.category_name,
      value: assumption.effective_monthly_amount,
      share: Math.max(0, Math.round((assumption.effective_monthly_amount / 4600) * 100)),
      tone: assumption.effective_monthly_amount > 500 ? "bucket-fixed" : "bucket-variable",
    }));
  }, [assumptions]);

  return (
    <>
      <div className="dashboard-title">
        <div>
          <h1>Dashboard Overview</h1>
        </div>
      </div>

      <section className="summary-grid dashboard-mobile-summary" aria-label="Forecast summary">
        <MetricCard label="Imported rows" value={importedRows > 0 ? String(importedRows) : "No import yet"} />
        <MetricCard label="Projected balance" value={projectedBalance ? currency.format(projectedBalance) : "Waiting"} />
        <MetricCard label="Lowest balance" value={lowestBalance ? currency.format(lowestBalance) : "Waiting"} />
        <MetricCard label="Active goals" value={String(activeGoals.length)} />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-column">
          <p className="dashboard-section-label">Current State</p>
          <article className="overview-card cash-card">
            <div className="card-heading">
              <h2>Cash Flow Breakdown</h2>
              <div className="card-actions" aria-hidden="true">
                <span>This Month</span>
                <span>⋮</span>
              </div>
            </div>
            <CashFlowDiagram categories={categories} />
          </article>

          <article className="overview-card liquidity-card">
            <div className="card-heading">
              <h2>Liquidity Threat Calendar</h2>
              <div className="chart-legend" aria-hidden="true">
                <span><i className="legend-average" />Avg Weekly Outflow</span>
                <span><i className="legend-expense" />Upcoming Expense</span>
                <span><i className="legend-risk" />High Risk Week</span>
              </div>
            </div>
            <LiquidityThreatChart />
            <div className="chart-note">
              <span><i aria-hidden="true">ⓘ</i> Spikes include known bills & subscriptions.</span>
              <a href="#planning">View full calendar <b aria-hidden="true">→</b></a>
            </div>
            <div className="insight-strip">
              <div>
                <span>90d Variable Burn Rate <i aria-hidden="true">ⓘ</i></span>
                <strong>1,120 € <small>/ month</small></strong>
                <p>↓ ±120 € vs prior 90 days</p>
              </div>
              <div>
                <span>Monthly Fixed Spend <i aria-hidden="true">ⓘ</i></span>
                <strong>1,450 €</strong>
                <p>42% of income</p>
              </div>
              <div>
                <span>Categorized Transactions <i aria-hidden="true">ⓘ</i></span>
                <strong>{importedRows > 0 ? String(importedRows) : "278"}</strong>
                <p>In the last 90 days</p>
              </div>
            </div>
          </article>
        </div>

        <div className="dashboard-column">
          <p className="dashboard-section-label">The Future</p>
          <article className="overview-card goal-card-clean">
            <div className="card-heading">
              <h2>Goal Tracker</h2>
              <button type="button">+ Add Goal</button>
            </div>
            <div className="goal-feature">
              <div className="goal-icon" aria-hidden="true">{featuredGoal.icon}</div>
              <div>
                <p>At your current spend rate and a 500 € ETF Sparrate,</p>
                <strong>you will reach your {featuredGoal.target} {featuredGoal.name} goal <span>in {featuredGoal.targetDate}.</span></strong>
              </div>
            </div>
            <div className="goal-progress">
              <span>{featuredGoal.name}</span>
              <strong>{featuredGoal.saved} / {featuredGoal.target}</strong>
              <b>{featuredGoal.progress}%</b>
              <i style={{ "--goal-progress": `${featuredGoal.progress}%` } as CSSProperties} />
            </div>
            <div className="goal-list-clean" aria-label="Goal progress list">
              {goalRows.map((goal) => (
                <div key={`${goal.name}-${goal.targetDate}`}>
                  <span><em aria-hidden="true">{goal.icon}</em>{goal.name}</span>
                  <strong>{goal.saved} / {goal.target}</strong>
                  <b>{goal.progress}%</b>
                  <time>{goal.targetDate}</time>
                  <i aria-hidden="true">›</i>
                </div>
              ))}
            </div>
          </article>

          <article className="overview-card projection-card-clean">
            <div className="card-heading">
              <h2>Projected Balance — Next 90 Days</h2>
              <div className="card-actions">
                <button type="button">Show details</button>
                <span>90 Days <b aria-hidden="true" /></span>
              </div>
            </div>
            <ProjectedBalanceChart projectedBalance={projectedBalance || 5420} />
          </article>

          <article className="overview-card free-cash-card">
            <div className="card-heading">
              <h2>True Free Cash Flow <span aria-hidden="true">ⓘ</span></h2>
            </div>
            <div className="cash-equation">
              <div className="cash-equation-card income">
                <span>Net Income</span>
                <strong>3,450 €</strong>
                <small>/month</small>
              </div>
              <b>−</b>
              <div className="cash-equation-card subscriptions">
                <span>Subscriptions</span>
                <strong>200 €</strong>
                <small>/month</small>
              </div>
              <b>−</b>
              <div className="cash-equation-card burn">
                <span>90d Variable Burn Rate</span>
                <strong>1,120 €</strong>
                <small>/month</small>
              </div>
              <b>=</b>
              <div className="cash-equation-card adjusted">
                <span>Adjusted FCF</span>
                <strong>2,130 €</strong>
                <small>/month</small>
              </div>
            </div>
            <p className="cash-equation-note">What you can safely allocate toward goals and investing.</p>
          </article>
        </div>
      </section>

      <div className="health-wrapper">
        <HealthCard error={healthError} health={health} loading={healthLoading} onRetry={onRetryHealth} />
      </div>
    </>
  );
}

function DashboardInputRail({ importedRows }: { importedRows: number }) {
  return (
    <div className="dashboard-input-rail" aria-label="Dashboard inputs preview">
      <div className="upload-card">
        <strong>Upload C24 CSV</strong>
        <div>
          <span>⇧</span>
          <p>Drag & drop your CSV file here or click to browse</p>
        </div>
      </div>
      <RailSlider label="ETF Sparrate" value="500 € / month" />
      <RailSlider label="Notgroschen Ziel" value="10,000 €" />
      <RailStat label="Current Balance" value="8,742.35 €" note="+ 312.40 € vs last 7 days" />
      <RailStat label="Monthly Income" value="3,450.00 €" note="Net after tax" />
      <RailStat label="Imported Rows" value={importedRows > 0 ? String(importedRows) : "No import yet"} note="Waiting for CSV import" />
    </div>
  );
}

function RailSlider({ label, value }: { label: string; value: string }) {
  return (
    <div className="rail-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i />
    </div>
  );
}

function RailStat({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="rail-card rail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function LiquidityThreatChart() {
  const today = new Date();
  const firstWeekStart = addDays(today, 2);
  const maxAmount = 2000;
  const chart = { left: 58, right: 20, top: 20, bottom: 48, width: 820, height: 280 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const barWidth = 27;
  const averageOutflow = 790;
  const averageY = chart.top + plotHeight - (averageOutflow / maxAmount) * plotHeight;
  const ticks = [0, 500, 1000, 1500, 2000];

  return (
    <div className="bar-chart" aria-label="Liquidity threat calendar for the next 10 weeks">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img">
        {ticks.map((tick) => {
          const y = chart.top + plotHeight - (tick / maxAmount) * plotHeight;
          return (
            <g key={tick}>
              <line className="chart-grid" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={chart.left - 10} y={y + 4} textAnchor="end">{compactEuro(tick)}</text>
            </g>
          );
        })}
        <line className="chart-axis" x1={chart.left} x2={chart.width - chart.right} y1={chart.top + plotHeight} y2={chart.top + plotHeight} />
        <line className="chart-axis" x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.top + plotHeight} />
        <line className="chart-average-line" x1={chart.left} x2={chart.width - chart.right} y1={averageY} y2={averageY} />
        {weeklyOutflows.map((amount, index) => {
          const slot = plotWidth / weeklyOutflows.length;
          const x = chart.left + slot * index + slot / 2;
          const height = (amount / maxAmount) * plotHeight;
          const y = chart.top + plotHeight - height;
          const start = addDays(firstWeekStart, index * 7);
          const end = addDays(start, 6);
          const isRisk = amount > 1200;

          return (
            <g key={`${amount}-${index}`}>
              <text className={isRisk ? "chart-value-label risk" : "chart-value-label"} x={x} y={y - 10} textAnchor="middle">{compactEuro(amount)}</text>
              <rect className={isRisk ? "bar-risk" : "bar-expense"} x={x - barWidth / 2} y={y} width={barWidth} height={height} rx="3" />
              <text className="chart-x-label" x={x} y={chart.height - 14} textAnchor="middle">{dateRangeLabel(start, end)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProjectedBalanceChart({ projectedBalance }: { projectedBalance: number }) {
  const today = new Date();
  const startDate = addDays(today, 1);
  const chart = { left: 58, right: 122, top: 44, bottom: 44, width: 640, height: 278 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const minBalance = 0;
  const maxBalance = 10000;
  const currentBalance = 5420;
  const yFor = (value: number) => chart.top + plotHeight - ((value - minBalance) / (maxBalance - minBalance)) * plotHeight;
  const xFor = (index: number) => chart.left + (index / (balanceSeries.length - 1)) * plotWidth;
  const linePath = balanceSeries.map((value, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`).join(" ");
  const projectionTicks = [0, 2000, 4000, 6000, 8000, 10000];
  const dateTicks = [0, 7, 14, 21, 28, 35, 42, 49, 56, 77, 84];
  const finalY = yFor(projectedBalance);

  return (
    <div className="line-chart" aria-label="Projected balance for the next 90 days">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img">
        {projectionTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line className="chart-grid" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={chart.left - 10} y={y + 4} textAnchor="end">{compactEuro(tick)}</text>
            </g>
          );
        })}
        <line className="chart-axis" x1={chart.left} x2={chart.width - chart.right} y1={chart.top + plotHeight} y2={chart.top + plotHeight} />
        <line className="chart-axis" x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.top + plotHeight} />
        <line className="chart-baseline" x1={chart.left} x2={chart.width - chart.right} y1={yFor(currentBalance)} y2={yFor(currentBalance)} />
        <path d={linePath} className="chart-line" />
        {billMarkerIndexes.map((index) => (
          <g className="bill-marker" key={index} transform={`translate(${xFor(index)} ${yFor(balanceSeries[index]) + 14})`}>
            <rect x="-7" y="-9" width="14" height="16" rx="2" />
            <path d="M-3 -4 H3M-3 0 H3M-3 4 H2" />
          </g>
        ))}
        {dateTicks.map((offset) => (
          <text className="chart-x-label" key={offset} x={chart.left + (offset / 90) * plotWidth} y={chart.height - 14} textAnchor="middle">
            {shortDate(addDays(startDate, offset))}
          </text>
        ))}
        <g className="line-chart-callout" transform={`translate(${chart.width - 112} ${Math.max(36, finalY - 29)})`}>
          <path d="M0 20 L-10 29 L0 38 Z" />
          <rect width="96" height="58" rx="4" />
          <text x="9" y="17">Projected Balance</text>
          <text x="9" y="38" className="callout-value">{compactEuro(projectedBalance)}</text>
          <text x="9" y="52">in 90 days</text>
        </g>
      </svg>
      <div className="line-chart-legend">
        <span><i className="legend-bill" />Subscription / Bill</span>
        <span><i className="legend-balance" />Current Balance</span>
      </div>
    </div>
  );
}

function CashFlowDiagram({ categories }: { categories: Array<{ label: string; value: number; share: number; tone: string }> }) {
  const categoryRows = categories
    .slice(0, 5)
    .sort((left, right) => toneRank(left.tone) - toneRank(right.tone));

  return (
    <div className="cash-flow-diagram" aria-label="Cash flow breakdown diagram">
      <svg viewBox="0 0 700 390" role="img">
        <defs>
          <linearGradient id="fixedFlow" x1="0" x2="1">
            <stop stopColor="#dbe7ff" />
            <stop offset="1" stopColor="#8fb2ff" />
          </linearGradient>
          <linearGradient id="variableFlow" x1="0" x2="1">
            <stop stopColor="#e2f5fb" />
            <stop offset="1" stopColor="#72d2ba" />
          </linearGradient>
          <linearGradient id="savingsFlow" x1="0" x2="1">
            <stop stopColor="#f9e4b3" />
            <stop offset="1" stopColor="#f4c65a" />
          </linearGradient>
        </defs>
        <path className="flow fixed" d="M104 194 C190 194 172 74 276 74" />
        <path className="flow variable" d="M104 194 C190 194 172 194 276 194" />
        <path className="flow savings" d="M104 194 C190 194 172 314 276 314" />
        <path className="flow fixed terminal" d="M284 74 H292" />
        <path className="flow variable terminal" d="M284 194 H292" />
        <path className="flow savings terminal" d="M284 314 H292" />

        {categoryRows.map((category, index) => {
          const targetY = 36 + index * 43 + 15.5;
          const flowTone = category.tone.replace("bucket-", "");
          const sourceY = category.tone === "bucket-savings" ? 314 : category.tone === "bucket-variable" ? 194 : 74;

          return (
            <g key={`${category.label}-flow`}>
              <path className={`flow ${flowTone} thin`} d={`M404 ${sourceY} C460 ${sourceY} 452 ${targetY} 512 ${targetY}`} />
              <path className={`flow ${flowTone} thin terminal`} d={`M516 ${targetY} H522`} />
            </g>
          );
        })}

        <rect className="svg-node income" x="2" y="158" width="102" height="72" rx="5" />
        <text className="svg-label" x="53" y="184" textAnchor="middle">Income</text>
        <text className="svg-value" x="53" y="207" textAnchor="middle">3,450 €</text>

        <g className="svg-bucket fixed">
          <rect x="292" y="36" width="112" height="76" rx="5" />
          <text className="svg-label" x="348" y="63" textAnchor="middle">Fixed</text>
          <text className="svg-value" x="348" y="84" textAnchor="middle">1,450 €</text>
          <text className="svg-sub" x="348" y="103" textAnchor="middle">(42%)</text>
        </g>
        <g className="svg-bucket variable">
          <rect x="292" y="156" width="112" height="76" rx="5" />
          <text className="svg-label" x="348" y="183" textAnchor="middle">Variable</text>
          <text className="svg-value" x="348" y="204" textAnchor="middle">1,100 €</text>
          <text className="svg-sub" x="348" y="223" textAnchor="middle">(32%)</text>
        </g>
        <g className="svg-bucket savings">
          <rect x="292" y="276" width="112" height="76" rx="5" />
          <text className="svg-label" x="348" y="303" textAnchor="middle">Savings</text>
          <text className="svg-value" x="348" y="324" textAnchor="middle">900 €</text>
          <text className="svg-sub" x="348" y="343" textAnchor="middle">(26%)</text>
        </g>

        {categoryRows.map((category, index) => {
          const y = 36 + index * 43;
          return (
            <g className={`svg-category ${category.tone}`} key={category.label}>
              <rect x="522" y={y} width="172" height="31" rx="4" />
              <text className="svg-category-label" x="534" y={y + 20}>{category.label}</text>
              <text className="svg-category-share" x="632" y={y + 20} textAnchor="end">{category.share}%</text>
              <text className="svg-category-value" x="684" y={y + 20} textAnchor="end">{currency.format(category.value)}</text>
            </g>
          );
        })}
        <text className="svg-footnote" x="2" y="374">Values rounded. Percentages of income.</text>
      </svg>
    </div>
  );
}

function toneRank(tone: string) {
  if (tone === "bucket-fixed") {
    return 0;
  }
  if (tone === "bucket-variable") {
    return 1;
  }
  return 2;
}

function LegacyWorkspace({ children }: { children: ReactNode }) {
  return <div className="legacy-workspace">{children}</div>;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function BucketCard({ label, share, tone, value }: { label: string; share: number; tone: string; value: number }) {
  return (
    <div className={`bucket-card ${tone}`}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
      <small>{share}%</small>
    </div>
  );
}

function LogoMark() {
  return <ChartCandlestick aria-hidden="true" strokeWidth={1} />;
}
