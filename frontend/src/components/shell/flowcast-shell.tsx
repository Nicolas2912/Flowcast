import { useMemo, useRef } from "react";

import type {
  AccountResponse,
  ForecastBundleResponse,
  ImportBatchResponse,
  SavingsBucketResponse,
  SavingsPlanSummaryResponse,
} from "../../lib/api";

export type AppPage = "overview" | "transactions" | "forecast" | "setup";

type AppDataSnapshot = {
  accounts: AccountResponse[];
  forecast: ForecastBundleResponse | null;
  imports: ImportBatchResponse[];
  savingsBuckets: SavingsBucketResponse[];
  savingsSummary: SavingsPlanSummaryResponse | null;
};

type FlowcastShellProps = {
  activePage: AppPage;
  children: React.ReactNode;
  error: string | null;
  importing: boolean;
  importError: string | null;
  isLoading: boolean;
  onPageChange: (page: AppPage) => void;
  onRefresh: () => void;
  onSelectedFileChange: (file: File | null) => void;
  onUpload: () => void;
  refreshing: boolean;
  selectedFile: File | null;
  snapshot: AppDataSnapshot;
};

const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const englishDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function formatCurrency(value: number): string {
  return germanCurrency.format(value);
}

function formatCompactCurrency(value: number): string {
  return value % 1 === 0 ? `${Math.round(value).toLocaleString("de-DE")} €` : formatCurrency(value);
}

function deriveCurrentBalance(accounts: AccountResponse[]): number {
  return accounts.reduce((sum, account) => sum + (account.current_balance_manual ?? account.opening_balance), 0);
}

function deriveMonthlyIncome(forecast: ForecastBundleResponse | null, savingsBuckets: SavingsBucketResponse[]): number {
  const horizon = forecast?.scenarios.find((item) => item.scenario_id === "expected")?.horizons.find((item) => item.days === 90);
  const start = horizon?.points[0]?.balance ?? 0;
  const end = horizon?.risk.ending_balance ?? 0;
  const savings = savingsBuckets.reduce((sum, bucket) => sum + bucket.monthly_contribution, 0);
  const inferred = (end - start) / 3 + savings;
  return inferred > 0 ? inferred : savings;
}

function deriveEmergencyProgress(summary: SavingsPlanSummaryResponse | null): number {
  if (!summary || !summary.emergency_fund_target_amount || summary.emergency_fund_target_amount <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((summary.emergency_fund_current_amount / summary.emergency_fund_target_amount) * 100));
}

export function FlowcastShell({
  activePage,
  children,
  error,
  importing,
  importError,
  isLoading,
  onPageChange,
  onRefresh,
  onSelectedFileChange,
  onUpload,
  refreshing,
  selectedFile,
  snapshot,
}: FlowcastShellProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentBalance = useMemo(() => deriveCurrentBalance(snapshot.accounts), [snapshot.accounts]);
  const monthlyIncome = useMemo(
    () => deriveMonthlyIncome(snapshot.forecast, snapshot.savingsBuckets),
    [snapshot.forecast, snapshot.savingsBuckets],
  );
  const emergencyProgress = useMemo(() => deriveEmergencyProgress(snapshot.savingsSummary), [snapshot.savingsSummary]);

  const latestImport = snapshot.imports[0] ?? null;
  const etfBucket = snapshot.savingsBuckets.find((bucket) => bucket.bucket_type === "etf") ?? null;
  const emergencyBucket = snapshot.savingsBuckets.find((bucket) => bucket.bucket_type === "emergency_fund") ?? null;
  const asOfLabel = snapshot.forecast?.generated_at
    ? `Data as of ${englishDate.format(new Date(snapshot.forecast.generated_at))}`
    : `Data as of ${englishDate.format(new Date())}`;

  return (
    <main className="fc-app-shell">
      <section className="fc-browser-frame">
        <div className="fc-product-header">
          <div className="fc-brand-block">
            <LogoIcon />
            <div className="fc-brand-copy">
              <p className="fc-brand-title">Predictive Personal Finance Engine</p>
              <p className="fc-brand-subtitle">Forecast cash flow, track goals, and predict liquidity risks</p>
            </div>
          </div>

          <div className="fc-header-utilities">
            <button aria-label="Theme settings" className="fc-icon-button" type="button">
              <SunIcon />
            </button>
            <span className="fc-header-date">{asOfLabel}</span>
            <button
              aria-label="Refresh dashboard data"
              className="fc-icon-button"
              disabled={refreshing || isLoading}
              onClick={onRefresh}
              type="button"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        <div className="fc-app-body">
          <aside className="fc-sidebar">
            <div className="fc-sidebar-header">
              <div className="fc-sidebar-title-wrap">
                <FilterIcon />
                <h2 className="fc-sidebar-title">Inputs</h2>
              </div>
              <button aria-label="Collapse sidebar" className="fc-collapse-button" type="button">
                <ChevronDoubleLeftIcon />
              </button>
            </div>

            <div className="fc-sidebar-stack">
              <section className="fc-side-card">
                <div className="fc-side-card-heading">
                  <h3>Upload C24 CSV</h3>
                  <InfoIcon />
                </div>

                <input
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)}
                  ref={fileInputRef}
                  type="file"
                />

                <button
                  className="fc-upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <CloudUploadIcon />
                  <span>Drag & drop your CSV file here</span>
                  <small>or click to browse</small>
                </button>

                <div className="fc-upload-file-row">
                  <div className="fc-upload-file-copy">
                    <FileIcon />
                    <div>
                      <p>{selectedFile?.name ?? latestImport?.source_filename ?? "No file selected yet"}</p>
                      <small>
                        {selectedFile
                          ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                          : latestImport
                            ? `${latestImport.transaction_count.toLocaleString("de-DE")} rows`
                            : "Choose a CSV to populate Flowcast"}
                      </small>
                    </div>
                  </div>
                  <div className={`fc-upload-status ${selectedFile || latestImport ? "is-ready" : ""}`}>
                    {selectedFile || latestImport ? "✓" : "…"}
                  </div>
                </div>

                <button
                  className="fc-upload-action"
                  disabled={!selectedFile || importing || isLoading}
                  onClick={onUpload}
                  type="button"
                >
                  {importing ? "Importing..." : "Import transactions"}
                </button>

                {importError ? <p className="fc-inline-error">{importError}</p> : null}
              </section>

              <SliderCard
                label="ETF Sparrate"
                max={2000}
                min={0}
                value={etfBucket?.monthly_contribution ?? 0}
              />
              <SliderCard
                label="Notgroschen Ziel"
                max={25000}
                min={1000}
                value={emergencyBucket?.target_amount ?? 0}
              />

              <MetricSidebarCard
                accent="green"
                helper={latestImport ? `+ ${latestImport.inserted_count} rows in latest import` : "Import a CSV to anchor the forecast"}
                icon={<WalletIcon />}
                label="Current Balance"
                value={formatCurrency(currentBalance)}
              />

              <MetricSidebarCard
                accent="blue"
                helper={monthlyIncome > 0 ? "Net monthly runway signal" : "Income becomes available after setup"}
                icon={<IncomeIcon />}
                label="Monthly Income"
                value={formatCurrency(monthlyIncome)}
              />

              <MetricSidebarCard
                accent="mint"
                helper={
                  snapshot.savingsSummary?.emergency_fund_target_amount
                    ? `${formatCompactCurrency(snapshot.savingsSummary.emergency_fund_current_amount)} / ${formatCompactCurrency(snapshot.savingsSummary.emergency_fund_target_amount)}`
                    : "Set a target to track emergency coverage"
                }
                icon={<ShieldIcon />}
                label="Emergency Fund Progress"
                progress={emergencyProgress}
                value={`${emergencyProgress}%`}
              />
            </div>
          </aside>

          <section className="fc-main-panel">
            <nav aria-label="Primary workspace navigation" className="fc-top-tabs">
              {[
                ["overview", "Overview"],
                ["transactions", "Transactions"],
                ["forecast", "Forecast"],
                ["setup", "Setup"],
              ].map(([page, label]) => (
                <button
                  key={page}
                  className={`fc-top-tab ${activePage === page ? "is-active" : ""}`}
                  onClick={() => onPageChange(page as AppPage)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>

            {error ? <div className="fc-global-error">{error}</div> : null}

            <div className="fc-main-content">{children}</div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SliderCard({ label, max, min, value }: { label: string; max: number; min: number; value: number }) {
  const ratio = max <= min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <section className="fc-side-card">
      <div className="fc-side-card-heading">
        <h3>{label}</h3>
        <span className="fc-side-card-value">{formatCompactCurrency(value)} / month</span>
      </div>
      <div className="fc-slider-track">
        <div className="fc-slider-fill" style={{ width: `${ratio}%` }} />
        <div className="fc-slider-thumb" style={{ left: `${ratio}%` }} />
      </div>
      <div className="fc-slider-range">
        <span>{formatCompactCurrency(min)}</span>
        <span>{formatCompactCurrency(max)}</span>
      </div>
    </section>
  );
}

function MetricSidebarCard({
  accent,
  helper,
  icon,
  label,
  progress,
  value,
}: {
  accent: "green" | "blue" | "mint";
  helper: string;
  icon: React.ReactNode;
  label: string;
  progress?: number;
  value: string;
}) {
  return (
    <section className="fc-side-card fc-side-card--metric">
      <div className={`fc-side-icon fc-side-icon--${accent}`}>{icon}</div>
      <div className="fc-side-metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{helper}</small>
        {typeof progress === "number" ? (
          <div className="fc-progress-track">
            <div className="fc-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LogoIcon() {
  return (
    <svg aria-hidden="true" className="fc-brand-logo" viewBox="0 0 32 32">
      <path d="M4 24.5h24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M8 21V14.5M14 21V10M20 21v-6M26 21V7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="M8 12l6-4 6 2 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="none" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <path d="M19 6.5V11h-4.5M5 17.5V13h4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M7.5 8.3A7 7 0 0 1 19 10M16.5 15.7A7 7 0 0 1 5 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon fc-inline-icon--teal" viewBox="0 0 24 24">
      <path d="M6 5h12M4 12h16M8 19h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="8" cy="5" fill="currentColor" r="1.8" />
      <circle cx="14" cy="12" fill="currentColor" r="1.8" />
      <circle cx="12" cy="19" fill="currentColor" r="1.8" />
    </svg>
  );
}

function ChevronDoubleLeftIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <path d="m14.5 7-5 5 5 5M19.5 7l-5 5 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon fc-inline-icon--muted" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="none" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10.5v5M12 7.6h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg aria-hidden="true" className="fc-upload-icon" viewBox="0 0 24 24">
      <path d="M7.5 18.5h8.2A4.3 4.3 0 0 0 16.1 10a5.6 5.6 0 0 0-10.7 1.7A3.6 3.6 0 0 0 7.5 18.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 15.5V8.8M9.3 11.6 12 8.8l2.7 2.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon fc-inline-icon--green" viewBox="0 0 24 24">
      <path d="M7 3.8h7.3L19 8.5v11.7H7z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M14.3 3.8v4.7H19M9.2 12h7.1M9.2 15h7.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <path d="M5 7.5h12.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1 0-5H18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="16.2" cy="14" fill="currentColor" r="1.2" />
    </svg>
  );
}

function IncomeIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <rect fill="none" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="5" />
      <path d="M8 12h8M12 8v8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="fc-inline-icon" viewBox="0 0 24 24">
      <path d="M12 3.8 18.2 6v5.2c0 3.7-2.3 7-6.2 9-3.9-2-6.2-5.3-6.2-9V6z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m9.5 12 1.7 1.7 3.4-3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
