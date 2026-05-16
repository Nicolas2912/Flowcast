import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  bulkUpdateTransactionCategory,
  fetchCategories,
  fetchMerchantRules,
  fetchTransactions,
  HttpError,
  runMerchantRules,
  updateTransactionCategory,
  type CategoryResponse,
  type ImportBatchResponse,
  type MerchantRuleResponse,
  type TransactionFilters,
  type TransactionListResponse,
} from "../../lib/api";

type TransactionsCategorizationScreenProps = {
  imports: ImportBatchResponse[];
  onDataChanged: () => Promise<void>;
};

const germanDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const pageSize = 10;

function toErrorMessage(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof HttpError) {
    return `${caughtError.payload.error.message} (${caughtError.payload.error.code})`;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}

function formatCategoryLabel(category: CategoryResponse): string {
  return category.parent_name ? `${category.parent_name} / ${category.name}` : category.name;
}

function buildDonutSegments(items: Array<{ label: string; value: number; color: string }>): string {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return "conic-gradient(#dfe8f3 0deg 360deg)";
  }

  let cursor = 0;
  const segments = items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 360;
    return `${item.color} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function formatRulePattern(rule: MerchantRuleResponse): string {
  return rule.pattern.length > 20 ? `${rule.pattern.slice(0, 20)}...` : rule.pattern;
}

export function TransactionsCategorizationScreen({
  imports,
  onDataChanged,
}: TransactionsCategorizationScreenProps) {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [rules, setRules] = useState<MerchantRuleResponse[]>([]);
  const [transactions, setTransactions] = useState<TransactionListResponse | null>(null);
  const [uncategorized, setUncategorized] = useState<TransactionListResponse | null>(null);
  const [distributionSample, setDistributionSample] = useState<TransactionListResponse | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    page_size: pageSize,
    search: "",
    category_id: null,
    date_from: "",
    date_to: "",
    uncategorized_only: false,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(filters.search ?? "");

  async function loadReferenceData() {
    setLoading(true);
    setError(null);
    try {
      const [categoryResponse, ruleResponse] = await Promise.all([fetchCategories(), fetchMerchantRules()]);
      setCategories(categoryResponse);
      setRules(ruleResponse);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The categorization page could not load."));
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactionsData(nextFilters?: TransactionFilters) {
    setTableLoading(true);
    setError(null);
    try {
      const mergedFilters = {
        ...filters,
        ...nextFilters,
        search: nextFilters?.search ?? deferredSearch,
      };
      const [tableResponse, uncategorizedResponse, distributionResponse] = await Promise.all([
        fetchTransactions(mergedFilters),
        fetchTransactions({
          ...mergedFilters,
          page: 1,
          page_size: 5,
          uncategorized_only: true,
        }),
        fetchTransactions({
          ...mergedFilters,
          page: 1,
          page_size: 120,
        }),
      ]);
      setTransactions(tableResponse);
      setUncategorized(uncategorizedResponse);
      setDistributionSample(distributionResponse);
      setSelectedIds([]);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The transaction list could not load."));
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    void loadTransactionsData({
      ...filters,
      search: deferredSearch,
    });
  }, [
    deferredSearch,
    filters.page,
    filters.page_size,
    filters.category_id,
    filters.date_from,
    filters.date_to,
    filters.uncategorized_only,
  ]);

  async function handleRunRules() {
    setSaving(true);
    setError(null);
    try {
      const summary = await runMerchantRules();
      setRunSummary(`${summary.updated_count} updated, ${summary.matched_count} matched, ${summary.cleared_count} cleared.`);
      await Promise.all([loadTransactionsData(), loadReferenceData(), onDataChanged()]);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The categorization run failed."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCategoryChange(transactionId: string, categoryId: number | null) {
    setSaving(true);
    setError(null);
    try {
      await updateTransactionCategory(transactionId, categoryId);
      await Promise.all([loadTransactionsData(), onDataChanged()]);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The category could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkApply() {
    if (selectedIds.length === 0 || bulkCategoryId === "") {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await bulkUpdateTransactionCategory(selectedIds, bulkCategoryId);
      await Promise.all([loadTransactionsData(), onDataChanged()]);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The bulk categorization request failed."));
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(transactionId: string) {
    setSelectedIds((current) =>
      current.includes(transactionId) ? current.filter((value) => value !== transactionId) : [...current, transactionId],
    );
  }

  const selectableCategories = categories.filter((category) => category.parent_id !== null);
  const uncategorizedCount = uncategorized?.total ?? 0;
  const transactionTotal = transactions?.total ?? 0;
  const uncategorizedShare = transactionTotal > 0 ? (uncategorizedCount / transactionTotal) * 100 : 0;
  const latestImport = imports[0] ?? null;
  const activeRules = rules.filter((rule) => rule.is_active);
  const reviewQueue = uncategorized?.items ?? [];

  const spendDistribution = useMemo(() => {
    const totals = new Map<string, number>();
    (distributionSample?.items ?? [])
      .filter((transaction) => transaction.amount < 0)
      .forEach((transaction) => {
        const label = transaction.category_name ?? "Uncategorized";
        totals.set(label, (totals.get(label) ?? 0) + Math.abs(transaction.amount));
      });

    const palette = ["#4f90f0", "#58d39b", "#87a8ff", "#b78fff", "#ffb05a", "#cdd6e4"];
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], index) => ({
        label,
        value,
        color: palette[index] ?? palette[palette.length - 1],
      }));
  }, [distributionSample]);

  const donutStyle = buildDonutSegments(spendDistribution);
  const pageItems = transactions?.items ?? [];
  const allSelected = pageItems.length > 0 && pageItems.every((transaction) => selectedIds.includes(transaction.id));

  return (
    <section className="fc-page-stack">
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Transactions &amp; Categorization</h1>
        </div>
      </div>

      <div className="fc-transactions-layout">
        <div className="fc-transactions-main">
          <div className="fc-transactions-kpis">
            <MetricCard
              accent="blue"
              helper={transactionTotal > 0 ? `Showing ${Math.min(transactionTotal, pageSize)} live rows` : "Waiting for imported data"}
              icon="📄"
              label="Imported Transactions"
              value={transactionTotal.toLocaleString("de-DE")}
            />
            <MetricCard
              accent="orange"
              helper={`${uncategorizedShare.toFixed(1)}% of visible dataset`}
              icon="❓"
              label="Uncategorized"
              value={uncategorizedCount.toLocaleString("de-DE")}
            />
            <MetricCard
              accent="green"
              helper={`${activeRules.length} active rules`}
              icon="🏷️"
              label="Merchant Rules"
              value={rules.length.toLocaleString("de-DE")}
            />
            <MetricCard
              accent="violet"
              helper={latestImport?.source_filename ?? "No import yet"}
              icon="☁️"
              label="Last Upload"
              value={latestImport ? germanDate.format(new Date(latestImport.imported_at)) : "Not yet"}
            />
          </div>

          <div className="fc-card fc-table-card">
            <div className="fc-card-header">
              <h2>Imported Transactions</h2>
              <div className="fc-card-actions">
                <button
                  className="fc-outline-button"
                  disabled={saving}
                  onClick={() => void handleRunRules()}
                  type="button"
                >
                  Run categorization
                </button>
              </div>
            </div>

            {error ? <div className="fc-global-error">{error}</div> : null}
            {runSummary ? <div className="fc-inline-success">{runSummary}</div> : null}

            <div className="fc-transactions-toolbar">
              <label className="fc-filter-input">
                <input
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({ ...current, page: 1, search: event.target.value })),
                    )
                  }
                  placeholder="Search payee or purpose..."
                  value={filters.search ?? ""}
                />
              </label>
              <label className="fc-filter-input">
                <input
                  onChange={(event) => setFilters((current) => ({ ...current, page: 1, date_from: event.target.value }))}
                  type="date"
                  value={filters.date_from ?? ""}
                />
              </label>
              <label className="fc-filter-input">
                <select
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      page: 1,
                      category_id: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  value={filters.category_id ?? ""}
                >
                  <option value="">All Categories</option>
                  {selectableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {formatCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fc-toggle-pill">
                <input
                  checked={Boolean(filters.uncategorized_only)}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, page: 1, uncategorized_only: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>Only uncategorized</span>
              </label>
            </div>

            <div className="fc-bulk-row">
              <label className="fc-select-pill">
                <select
                  onChange={(event) => setBulkCategoryId(event.target.value ? Number(event.target.value) : "")}
                  value={bulkCategoryId}
                >
                  <option value="">Bulk category</option>
                  {selectableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {formatCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="fc-outline-button"
                disabled={saving || selectedIds.length === 0 || bulkCategoryId === ""}
                onClick={() => void handleBulkApply()}
                type="button"
              >
                Apply to {selectedIds.length} selected
              </button>
            </div>

            <div className="fc-transactions-table-wrap">
              <table className="fc-transactions-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        checked={allSelected}
                        onChange={() =>
                          setSelectedIds(allSelected ? [] : pageItems.map((transaction) => transaction.id))
                        }
                        type="checkbox"
                      />
                    </th>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr>
                      <td colSpan={8}>Loading transactions...</td>
                    </tr>
                  ) : null}
                  {!tableLoading && pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No transactions match the current filters.</td>
                    </tr>
                  ) : null}
                  {pageItems.map((transaction) => {
                    const status =
                      transaction.category_id === null
                        ? "Review"
                        : transaction.category_assignment_method === "manual"
                          ? "Manual"
                          : "Auto";
                    return (
                      <tr key={transaction.id}>
                        <td>
                          <input
                            checked={selectedIds.includes(transaction.id)}
                            onChange={() => toggleSelected(transaction.id)}
                            type="checkbox"
                          />
                        </td>
                        <td>{germanDate.format(new Date(transaction.booking_date))}</td>
                        <td className="fc-table-primary">{transaction.payee ?? "Unknown"}</td>
                        <td>{transaction.purpose ?? "—"}</td>
                        <td className={transaction.amount >= 0 ? "is-positive" : "is-negative"}>
                          {germanCurrency.format(transaction.amount)}
                        </td>
                        <td>
                          <select
                            className="fc-table-select"
                            disabled={saving || loading}
                            onChange={(event) =>
                              void handleCategoryChange(
                                transaction.id,
                                event.target.value ? Number(event.target.value) : null,
                              )
                            }
                            value={transaction.category_id ?? ""}
                          >
                            <option value="">Uncategorized</option>
                            {selectableCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {formatCategoryLabel(category)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{transaction.source_import_filename ?? "Direct"}</td>
                        <td>
                          <span className={`fc-status-pill fc-status-pill--${status.toLowerCase()}`}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {transactions ? (
              <div className="fc-table-footer">
                <span>
                  Showing {Math.min((transactions.page - 1) * transactions.page_size + 1, transactions.total)} to{" "}
                  {Math.min(transactions.page * transactions.page_size, transactions.total)} of {transactions.total} transactions
                </span>
                <div className="fc-pagination">
                  <button
                    className="fc-icon-button"
                    disabled={transactions.page <= 1}
                    onClick={() =>
                      setFilters((current) => ({ ...current, page: Math.max((current.page ?? 1) - 1, 1) }))
                    }
                    type="button"
                  >
                    ‹
                  </button>
                  <span className="fc-page-chip">{transactions.page}</span>
                  <button
                    className="fc-icon-button"
                    disabled={transactions.page >= transactions.total_pages}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: Math.min((current.page ?? 1) + 1, transactions.total_pages),
                      }))
                    }
                    type="button"
                  >
                    ›
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="fc-transactions-bottom">
            <div className="fc-card">
              <div className="fc-card-header">
                <h2>Category Distribution</h2>
                <span className="fc-card-caption">(by spend)</span>
              </div>
              <div className="fc-donut-layout">
                <div className="fc-donut-ring" style={{ backgroundImage: donutStyle }}>
                  <div className="fc-donut-hole" />
                </div>
                <div className="fc-donut-legend">
                  {spendDistribution.length === 0 ? <p className="fc-empty-inline">No spending sample yet.</p> : null}
                  {spendDistribution.map((item) => (
                    <div key={item.label} className="fc-donut-row">
                      <span className="fc-donut-label">
                        <i style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <strong>{germanCurrency.format(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="fc-card">
              <div className="fc-card-header">
                <h2>Merchant Rules</h2>
                <a className="fc-link-button" href="#fc-pipeline">
                  Examples
                </a>
              </div>
              <div className="fc-rule-example-list">
                {rules.slice(0, 5).map((rule) => (
                  <div key={rule.id} className="fc-rule-example-row">
                    <span>{formatRulePattern(rule)}</span>
                    <span className="fc-tag-pill">{rule.category_name}</span>
                    <small>{rule.pattern_type}</small>
                  </div>
                ))}
                {rules.length === 0 ? <p className="fc-empty-inline">No merchant rules created yet.</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="fc-transactions-rail">
          <div className="fc-card" id="fc-pipeline">
            <div className="fc-card-header">
              <h2>Categorization Pipeline</h2>
            </div>
            <p className="fc-page-copy">Hybrid flow combining deterministic rules and model-assisted review.</p>
            <div className="fc-pipeline-list">
              <PipelineStep
                description={`Match against ${activeRules.length} active merchant rules`}
                number="1"
                title="Deterministic Rules"
              />
              <PipelineStep
                description={`${uncategorizedCount} rows still need review or future LLM support`}
                number="2"
                title="Review Queue"
              />
              <PipelineStep
                description="High-confidence predictions can become new rules after validation"
                number="3"
                title="Cache to Rules"
              />
            </div>
          </div>

          <div className="fc-card">
            <div className="fc-card-header">
              <h2>AI Review Queue</h2>
              <span className="fc-warning-badge">{uncategorizedCount} uncategorized</span>
            </div>
            <div className="fc-review-list">
              {reviewQueue.map((transaction) => (
                <div key={transaction.id} className="fc-review-row">
                  <div>
                    <strong>{transaction.payee ?? "Unknown merchant"}</strong>
                    <span>{transaction.purpose ?? "Waiting for category"}</span>
                  </div>
                  <small>{germanCurrency.format(transaction.amount)}</small>
                </div>
              ))}
              {reviewQueue.length === 0 ? <p className="fc-empty-inline">Everything in the current filter is categorized.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  accent,
  helper,
  icon,
  label,
  value,
}: {
  accent: "blue" | "orange" | "green" | "violet";
  helper: string;
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`fc-card fc-mini-metric fc-mini-metric--${accent}`}>
      <div className="fc-mini-metric-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </div>
  );
}

function PipelineStep({
  description,
  number,
  title,
}: {
  description: string;
  number: string;
  title: string;
}) {
  return (
    <div className="fc-pipeline-step">
      <div className="fc-pipeline-badge">{number}</div>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}
