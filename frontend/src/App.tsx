import { useEffect, useMemo, useState, type ReactNode } from "react";

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

function expectedHorizon(forecast: ForecastBundleResponse | null) {
  return forecast?.scenarios.find((scenario) => scenario.scenario_id === "expected")?.horizons.find((horizon) => horizon.days === 90) ?? null;
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
        <button type="button" onClick={onRetryHealth}>Refresh</button>
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
              <span>Next 10 weeks</span>
            </div>
            <div className="bar-chart" aria-hidden="true">
              {[620, 870, 1680, 640, 720, 1550, 610, 840, 670, 930].map((amount, index) => (
                <div className={amount > 1200 ? "risk" : ""} key={`${amount}-${index}`}>
                  <span style={{ height: `${Math.max(28, amount / 18)}px` }} />
                  <b>{currency.format(amount).replace(",00", "")}</b>
                </div>
              ))}
            </div>
            <div className="insight-strip">
              <MetricCard label="90d Variable Burn Rate" value="1.120 € / month" />
              <MetricCard label="Monthly Fixed Spend" value="1.450 €" />
              <MetricCard label="Categorized Transactions" value={importedRows > 0 ? String(importedRows) : "278"} />
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
            {activeGoals.length > 0 ? (
              <div className="goal-list-clean">
                {activeGoals.slice(0, 4).map((goal) => (
                  <div key={goal.id}>
                    <span>{goal.name}</span>
                    <strong>{currency.format(goal.target_amount)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="goal-feature">
                <div className="goal-icon" aria-hidden="true">💻</div>
                <div>
                  <p>At your current spend rate and a 500 € ETF Sparrate,</p>
                  <strong>you will reach your 1,500 € Laptop goal <span>in August 2026.</span></strong>
                </div>
              </div>
            )}
            <div className="goal-progress">
              <span>Laptop</span>
              <strong>1,050 € / 1,500 €</strong>
              <b>70%</b>
              <i />
            </div>
          </article>

          <article className="overview-card projection-card-clean">
            <div className="card-heading">
              <h2>Projected Balance — Next 90 Days</h2>
              <span>90 Days</span>
            </div>
            <div className="line-chart" aria-hidden="true">
              <svg viewBox="0 0 640 250">
                <path d="M30 44 H610M30 92 H610M30 140 H610M30 188 H610" className="chart-grid" />
                <path d="M30 94 L82 102 L128 118 L134 82 L188 84 L220 104 L250 96 L286 113 L292 78 L348 83 L394 104 L430 119 L438 74 L500 98 L548 123 L592 132" className="chart-line" />
                <path d="M30 150 H610" className="chart-baseline" />
              </svg>
              <div>
                <span>Projected Balance</span>
                <strong>{projectedBalance ? currency.format(projectedBalance) : currency.format(5420)}</strong>
              </div>
            </div>
          </article>

          <article className="overview-card free-cash-card">
            <div className="card-heading">
              <h2>True Free Cash Flow</h2>
              <span>Adjusted</span>
            </div>
            <div className="cash-equation">
              <MetricCard label="Net Income" value="3.450 €" />
              <b>−</b>
              <MetricCard label="Subscriptions" value="200 €" />
              <b>−</b>
              <MetricCard label="90d Variable Burn Rate" value="1.120 €" />
              <b>=</b>
              <MetricCard label="Adjusted FCF" value="2.130 €" />
            </div>
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

function CashFlowDiagram({ categories }: { categories: Array<{ label: string; value: number; share: number; tone: string }> }) {
  const categoryRows = categories
    .slice(0, 5)
    .sort((left, right) => toneRank(left.tone) - toneRank(right.tone));

  return (
    <div className="cash-flow-diagram" aria-label="Cash flow breakdown diagram">
      <svg viewBox="0 0 760 390" role="img">
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
        <path className="flow fixed" d="M126 194 C218 194 196 74 298 74" />
        <path className="flow variable" d="M126 194 C218 194 196 194 298 194" />
        <path className="flow savings" d="M126 194 C218 194 196 314 298 314" />
        <path className="flow fixed terminal" d="M306 74 H314" />
        <path className="flow variable terminal" d="M306 194 H314" />
        <path className="flow savings terminal" d="M306 314 H314" />

        {categoryRows.map((category, index) => {
          const targetY = 36 + index * 43 + 15.5;
          const flowTone = category.tone.replace("bucket-", "");
          const sourceY = category.tone === "bucket-savings" ? 314 : category.tone === "bucket-variable" ? 194 : 74;

          return (
            <g key={`${category.label}-flow`}>
              <path className={`flow ${flowTone} thin`} d={`M426 ${sourceY} C492 ${sourceY} 476 ${targetY} 540 ${targetY}`} />
              <path className={`flow ${flowTone} thin terminal`} d={`M544 ${targetY} H550`} />
            </g>
          );
        })}

        <rect className="svg-node income" x="28" y="158" width="102" height="72" rx="5" />
        <text className="svg-label" x="78" y="184" textAnchor="middle">Income</text>
        <text className="svg-value" x="78" y="207" textAnchor="middle">3,450 €</text>

        <g className="svg-bucket fixed">
          <rect x="314" y="36" width="112" height="76" rx="5" />
          <text className="svg-label" x="370" y="63" textAnchor="middle">Fixed</text>
          <text className="svg-value" x="370" y="84" textAnchor="middle">1,450 €</text>
          <text className="svg-sub" x="370" y="103" textAnchor="middle">(42%)</text>
        </g>
        <g className="svg-bucket variable">
          <rect x="314" y="156" width="112" height="76" rx="5" />
          <text className="svg-label" x="370" y="183" textAnchor="middle">Variable</text>
          <text className="svg-value" x="370" y="204" textAnchor="middle">1,100 €</text>
          <text className="svg-sub" x="370" y="223" textAnchor="middle">(32%)</text>
        </g>
        <g className="svg-bucket savings">
          <rect x="314" y="276" width="112" height="76" rx="5" />
          <text className="svg-label" x="370" y="303" textAnchor="middle">Savings</text>
          <text className="svg-value" x="370" y="324" textAnchor="middle">900 €</text>
          <text className="svg-sub" x="370" y="343" textAnchor="middle">(26%)</text>
        </g>

        {categoryRows.map((category, index) => {
          const y = 36 + index * 43;
          return (
            <g className={`svg-category ${category.tone}`} key={category.label}>
              <rect x="550" y={y} width="188" height="31" rx="4" />
              <text className="svg-category-label" x="564" y={y + 20}>{category.label}</text>
              <text className="svg-category-share" x="678" y={y + 20} textAnchor="end">{category.share}%</text>
              <text className="svg-category-value" x="728" y={y + 20} textAnchor="end">{currency.format(category.value)}</text>
            </g>
          );
        })}
        <text className="svg-footnote" x="28" y="374">Values rounded. Percentages of income.</text>
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
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 31h30M9 27V16l7-5v16M20 27V12l7-6v21M31 27V9" />
      <path d="M7 17l9-7 7 4 10-10" />
    </svg>
  );
}
