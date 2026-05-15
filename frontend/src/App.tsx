import { useEffect, useState } from "react";

import { DashboardOverview } from "./components/dashboard/dashboard-overview";
import { ForecastScenarioPlanner } from "./components/forecast/forecast-scenario-planner";
import { FlowcastShell, type AppPage } from "./components/shell/flowcast-shell";
import {
  fetchAccounts,
  fetchCategories,
  fetchForecast,
  fetchGoals,
  fetchImports,
  fetchPlannedPayments,
  fetchSavingsBuckets,
  fetchSavingsSummary,
  fetchSpendingAssumptions,
  fetchTransactions,
  HttpError,
  type AccountResponse,
  type CategoryResponse,
  type ForecastBundleResponse,
  type GoalResponse,
  type ImportBatchResponse,
  type PlannedPaymentResponse,
  type SavingsBucketResponse,
  type SavingsPlanSummaryResponse,
  type SpendingAssumptionResponse,
  type TransactionListResponse,
  uploadC24Csv,
} from "./lib/api";

type AppData = {
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  forecast: ForecastBundleResponse | null;
  goals: GoalResponse[];
  imports: ImportBatchResponse[];
  plannedPayments: PlannedPaymentResponse[];
  savingsBuckets: SavingsBucketResponse[];
  savingsSummary: SavingsPlanSummaryResponse | null;
  spendingAssumptions: SpendingAssumptionResponse[];
  transactions: TransactionListResponse | null;
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

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>("overview");
  const [data, setData] = useState<AppData>({
    accounts: [],
    categories: [],
    forecast: null,
    goals: [],
    imports: [],
    plannedPayments: [],
    savingsBuckets: [],
    savingsSummary: null,
    spendingAssumptions: [],
    transactions: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function loadAppData(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const [
        accounts,
        categories,
        forecast,
        goals,
        imports,
        plannedPayments,
        savingsBuckets,
        savingsSummary,
        spendingAssumptions,
        transactions,
      ] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
        fetchForecast().catch(() => null),
        fetchGoals(),
        fetchImports(),
        fetchPlannedPayments(),
        fetchSavingsBuckets(),
        fetchSavingsSummary().catch(() => null),
        fetchSpendingAssumptions(),
        fetchTransactions({ page: 1, page_size: 10 }).catch(() => null),
      ]);

      setData({
        accounts,
        categories,
        forecast,
        goals,
        imports,
        plannedPayments,
        savingsBuckets,
        savingsSummary,
        spendingAssumptions,
        transactions,
      });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The Flowcast workspace could not load."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAppData("initial");
  }, []);

  async function handleUpload() {
    if (!selectedFile) {
      setImportError("Choose a CSV file first.");
      return;
    }

    const accountId = data.accounts[0]?.id;
    if (!accountId) {
      setImportError("No account is available yet. Seed the backend first.");
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      await uploadC24Csv(selectedFile, accountId);
      setSelectedFile(null);
      await loadAppData("refresh");
    } catch (caughtError) {
      setImportError(toErrorMessage(caughtError, "The CSV import failed."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <FlowcastShell
      activePage={activePage}
      error={error}
      importing={importing}
      importError={importError}
      isLoading={loading}
      onPageChange={setActivePage}
      onRefresh={() => void loadAppData("refresh")}
      onSelectedFileChange={setSelectedFile}
      onUpload={() => void handleUpload()}
      refreshing={refreshing}
      selectedFile={selectedFile}
      snapshot={data}
    >
      {activePage === "overview" ? <DashboardOverview data={data} isLoading={loading} /> : null}
      {activePage === "forecast" ? (
        <ForecastScenarioPlanner
          accounts={data.accounts}
          forecast={data.forecast}
          goals={data.goals}
          isLoading={loading}
          plannedPayments={data.plannedPayments}
          savingsBuckets={data.savingsBuckets}
          savingsSummary={data.savingsSummary}
          spendingAssumptions={data.spendingAssumptions}
        />
      ) : null}
      {activePage !== "overview" && activePage !== "forecast" ? <PlaceholderPage activePage={activePage} /> : null}
    </FlowcastShell>
  );
}

function PlaceholderPage({ activePage }: { activePage: Exclude<AppPage, "overview"> }) {
  const content = {
    transactions: {
      eyebrow: "FLO-41 next",
      title: "Transactions & Categorization",
      text: "The shared shell is now in place, but this page still needs the dedicated high-density table, pipeline, and review queue from the reference image.",
      bullets: [
        "Imported-transactions table with filters, badges, and pagination",
        "Three-step categorization pipeline with deterministic and LLM stages",
        "Review queue, category donut, and merchant-rule cards",
      ],
    },
    forecast: {
      eyebrow: "FLO-40 next",
      title: "Forecast & Scenario Planner",
      text: "The navigation target is live, but the scenario controls and projection workspace are still tracked as the separate forecast implementation issue.",
      bullets: [
        "365-day projection chart with threshold and subscription markers",
        "Scenario controls, liquidity alerts, and bottom formula explainer",
        "Monthly free-cash-flow bars and subscription impact calendar",
      ],
    },
    setup: {
      eyebrow: "FLO-42 next",
      title: "Goals, Subscriptions & Rules",
      text: "This route is reserved inside the shell and now matches the navigation structure from the mockups, but the detailed setup management cards are still a follow-on issue.",
      bullets: [
        "Goals table with progress bars and monthly allocation totals",
        "Subscriptions table with next-charge dates and service icons",
        "Merchant rules, categories, and database status cards",
      ],
    },
  } as const;

  const page = content[activePage];

  return (
    <section className="fc-page-stack">
      <div className="fc-card fc-card--hero">
        <p className="fc-eyebrow">{page.eyebrow}</p>
        <h1 className="fc-page-title">{page.title}</h1>
        <p className="fc-page-copy">{page.text}</p>
      </div>

      <div className="fc-grid-3">
        {page.bullets.map((bullet) => (
          <div key={bullet} className="fc-card fc-card--placeholder">
            <div className="fc-placeholder-icon" />
            <p className="fc-placeholder-text">{bullet}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
