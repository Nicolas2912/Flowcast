import { useEffect, useState } from "react";

import { DashboardOverview } from "./components/dashboard/dashboard-overview";
import { ForecastScenarioPlanner } from "./components/forecast/forecast-scenario-planner";
import { GoalsSubscriptionsRulesScreen } from "./components/setup/goals-subscriptions-rules-screen";
import { FlowcastShell, type AppPage } from "./components/shell/flowcast-shell";
import { TransactionsCategorizationScreen } from "./components/transactions/transactions-categorization-screen";
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
      {activePage === "transactions" ? (
        <TransactionsCategorizationScreen imports={data.imports} onDataChanged={() => loadAppData("refresh")} />
      ) : null}
      {activePage === "setup" ? (
        <GoalsSubscriptionsRulesScreen
          categories={data.categories}
          goals={data.goals}
          onDataChanged={() => loadAppData("refresh")}
          plannedPayments={data.plannedPayments}
          transactions={data.transactions}
        />
      ) : null}
    </FlowcastShell>
  );
}
