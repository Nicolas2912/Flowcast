import { startTransition, useDeferredValue, useEffect, useState } from "react";

import {
  bulkUpdateTransactionCategory,
  createCategory,
  createMerchantRule,
  deleteMerchantRule,
  fetchAccounts,
  fetchCategories,
  fetchMerchantRules,
  fetchTransactions,
  HttpError,
  runMerchantRules,
  updateCategory,
  updateMerchantRule,
  updateTransactionCategory,
  type AccountResponse,
  type CategorizationRunResponse,
  type CategoryPayload,
  type CategoryResponse,
  type MerchantRulePayload,
  type MerchantRuleResponse,
  type TransactionFilters,
  type TransactionListResponse,
} from "../../lib/api";
import { Card } from "../ui/card";

const pageSize = 25;

const blankCategoryForm: CategoryPayload = {
  name: "",
  parent_id: null,
  behavior_type: "variable_expense",
  is_essential: false,
  is_variable: true,
  is_income: false,
  is_saving: false,
  is_excluded: false,
  sort_order: 100,
};

const blankRuleForm: MerchantRulePayload = {
  name: "",
  pattern_type: "contains",
  pattern: "",
  category_id: 0,
  priority: 100,
  is_active: true,
};

const germanDate = new Intl.DateTimeFormat("de-DE");
const germanCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
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

function formatAssignmentMethod(method: string | null): string {
  switch (method) {
    case "manual":
      return "Manual";
    case "manual_clear":
      return "Manual clear";
    case "rule":
      return "Rule";
    default:
      return "Uncategorized";
  }
}

function formatCategoryLabel(category: CategoryResponse): string {
  return category.parent_name ? `${category.parent_name} / ${category.name}` : category.name;
}

export function TransactionWorkspace() {
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [rules, setRules] = useState<MerchantRuleResponse[]>([]);
  const [transactions, setTransactions] = useState<TransactionListResponse | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    page_size: pageSize,
    search: "",
    account_id: null,
    category_id: null,
    uncategorized_only: false,
    date_from: "",
    date_to: "",
  });
  const deferredSearch = useDeferredValue(filters.search ?? "");
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | "">("");
  const [categoryForm, setCategoryForm] = useState<CategoryPayload>(blankCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState<MerchantRulePayload>(blankRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [runSummary, setRunSummary] = useState<CategorizationRunResponse | null>(null);

  async function loadWorkspaceData() {
    setLoading(true);
    setError(null);
    try {
      const [accountsResponse, categoriesResponse, rulesResponse] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
        fetchMerchantRules(),
      ]);
      setAccounts(accountsResponse);
      setCategories(categoriesResponse);
      setRules(rulesResponse);
      setRuleForm((current) => ({
        ...current,
        category_id: current.category_id || categoriesResponse.find((category) => category.parent_id !== null)?.id || 0,
      }));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The transaction workspace could not load."));
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions(nextFilters?: TransactionFilters) {
    setTableLoading(true);
    try {
      const transactionResponse = await fetchTransactions({
        ...filters,
        ...nextFilters,
        search: nextFilters?.search ?? deferredSearch,
      });
      setTransactions(transactionResponse);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The transaction list could not load."));
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspaceData();
  }, []);

  useEffect(() => {
    void loadTransactions({
      ...filters,
      search: deferredSearch,
    });
    setSelectedTransactionIds([]);
  }, [
    deferredSearch,
    filters.page,
    filters.page_size,
    filters.account_id,
    filters.category_id,
    filters.uncategorized_only,
    filters.date_from,
    filters.date_to,
  ]);

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryForm(blankCategoryForm);
  }

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleForm({
      ...blankRuleForm,
      category_id: categories.find((category) => category.parent_id !== null)?.id || 0,
    });
  }

  async function handleCategorySave() {
    setSaving(true);
    setError(null);
    try {
      if (editingCategoryId === null) {
        await createCategory(categoryForm);
      } else {
        await updateCategory(editingCategoryId, categoryForm);
      }
      resetCategoryForm();
      await loadWorkspaceData();
      await loadTransactions();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The category could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRuleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editingRuleId === null) {
        await createMerchantRule(ruleForm);
      } else {
        await updateMerchantRule(editingRuleId, ruleForm);
      }
      resetRuleForm();
      await loadWorkspaceData();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The merchant rule could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    setSaving(true);
    setError(null);
    try {
      await deleteMerchantRule(ruleId);
      if (editingRuleId === ruleId) {
        resetRuleForm();
      }
      await loadWorkspaceData();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The merchant rule could not be deleted."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunRules() {
    setSaving(true);
    setError(null);
    try {
      const summary = await runMerchantRules();
      setRunSummary(summary);
      await loadTransactions();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The categorization run failed."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSingleCategoryChange(transactionId: string, categoryId: number | null) {
    setSaving(true);
    setError(null);
    try {
      await updateTransactionCategory(transactionId, categoryId);
      await loadTransactions();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The transaction category could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkCategorization() {
    if (selectedTransactionIds.length === 0 || bulkCategoryId === "") {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await bulkUpdateTransactionCategory(selectedTransactionIds, bulkCategoryId);
      setSelectedTransactionIds([]);
      await loadTransactions();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError, "The bulk categorization request failed."));
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(transactionId: string) {
    setSelectedTransactionIds((current) =>
      current.includes(transactionId) ? current.filter((value) => value !== transactionId) : [...current, transactionId],
    );
  }

  function toggleSelectAllCurrentPage() {
    const pageIds = transactions?.items.map((item) => item.id) ?? [];
    const allSelected = pageIds.every((id) => selectedTransactionIds.includes(id));
    setSelectedTransactionIds((current) =>
      allSelected ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])],
    );
  }

  const transactionItems = transactions?.items ?? [];
  const selectableCategories = categories.filter((category) => category.parent_id !== null);

  return (
    <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-4 workspace</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Review, search, and categorize transactions</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-sky-50/75">
              Filter imports, correct categories row by row, batch-edit the current selection, and keep deterministic
              rules from overwriting manual choices.
            </p>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            onClick={() => {
              void loadWorkspaceData();
              void loadTransactions();
            }}
            type="button"
          >
            Refresh workspace
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Search</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                startTransition(() =>
                  setFilters((current) => ({ ...current, page: 1, search: event.target.value })),
                )
              }
              placeholder="Payee, purpose, text"
              value={filters.search ?? ""}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">Account</span>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  account_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={filters.account_id ?? ""}
            >
              <option value="">All accounts</option>
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
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  category_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={filters.category_id ?? ""}
            >
              <option value="">All categories</option>
              {selectableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">From</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setFilters((current) => ({ ...current, page: 1, date_from: event.target.value }))}
              type="date"
              value={filters.date_from ?? ""}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-sky-100/60">To</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setFilters((current) => ({ ...current, page: 1, date_to: event.target.value }))}
              type="date"
              value={filters.date_to ?? ""}
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-sky-100/75">
          <input
            checked={Boolean(filters.uncategorized_only)}
            onChange={(event) =>
              setFilters((current) => ({ ...current, page: 1, uncategorized_only: event.target.checked }))
            }
            type="checkbox"
          />
          Show only uncategorized transactions
        </label>

        {error ? (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {runSummary ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Categorization run: {runSummary.updated_count} updated, {runSummary.matched_count} matched,{" "}
            {runSummary.cleared_count} cleared.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-slate-950/30 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
              disabled={saving}
              onClick={() => void handleRunRules()}
              type="button"
            >
              Run merchant rules
            </button>

            <select
              className="rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-2 text-sm text-white outline-none"
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

            <button
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-sky-100/45"
              disabled={saving || selectedTransactionIds.length === 0 || bulkCategoryId === ""}
              onClick={() => void handleBulkCategorization()}
              type="button"
            >
              Apply to {selectedTransactionIds.length} selected
            </button>
          </div>

          <div className="text-sm text-sky-100/70">
            {transactions ? `${transactions.total} transactions` : loading ? "Loading..." : "No transactions"}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3 text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.24em] text-sky-100/55">
                <th className="px-3">
                  <input
                    checked={
                      transactionItems.length > 0 &&
                      transactionItems.every((transaction) => selectedTransactionIds.includes(transaction.id))
                    }
                    onChange={toggleSelectAllCurrentPage}
                    type="checkbox"
                  />
                </th>
                <th className="px-3">Date</th>
                <th className="px-3">Payee</th>
                <th className="px-3">Purpose</th>
                <th className="px-3">Amount</th>
                <th className="px-3">Account</th>
                <th className="px-3">Category</th>
                <th className="px-3">Method</th>
                <th className="px-3">Import</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-sky-100/70" colSpan={9}>
                    Loading transactions...
                  </td>
                </tr>
              ) : null}
              {!tableLoading && transactionItems.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-sky-100/70" colSpan={9}>
                    No transactions match the current filters.
                  </td>
                </tr>
              ) : null}
              {transactionItems.map((transaction) => (
                <tr key={transaction.id} className="rounded-2xl bg-white/6 text-sm text-sky-50">
                  <td className="rounded-l-2xl px-3 py-4 align-top">
                    <input
                      checked={selectedTransactionIds.includes(transaction.id)}
                      onChange={() => toggleSelected(transaction.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-3 py-4 align-top">{germanDate.format(new Date(transaction.booking_date))}</td>
                  <td className="px-3 py-4 align-top font-medium text-white">{transaction.payee ?? "Unknown"}</td>
                  <td className="max-w-sm px-3 py-4 align-top text-sky-50/72">{transaction.purpose ?? "—"}</td>
                  <td
                    className={`px-3 py-4 align-top font-semibold ${
                      transaction.amount >= 0 ? "text-emerald-200" : "text-rose-200"
                    }`}
                  >
                    {germanCurrency.format(transaction.amount)}
                  </td>
                  <td className="px-3 py-4 align-top text-sky-50/72">{transaction.account_name}</td>
                  <td className="px-3 py-4 align-top">
                    <select
                      className="min-w-[220px] rounded-2xl border border-white/15 bg-slate-950/45 px-3 py-2 text-sm text-white outline-none"
                      disabled={saving}
                      onChange={(event) =>
                        void handleSingleCategoryChange(
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
                  <td className="px-3 py-4 align-top text-sky-50/72">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.22em]">
                      {formatAssignmentMethod(transaction.category_assignment_method)}
                    </span>
                  </td>
                  <td className="rounded-r-2xl px-3 py-4 align-top text-sky-50/72">
                    {transaction.source_import_filename ?? "Direct"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transactions ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-sm text-sky-100/75">
            <span>
              Page {transactions.page} of {Math.max(transactions.total_pages, 1)}
            </span>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-white/20 px-4 py-2 text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-sky-100/40"
                disabled={transactions.page <= 1}
                onClick={() => setFilters((current) => ({ ...current, page: Math.max((current.page ?? 1) - 1, 1) }))}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-full border border-white/20 px-4 py-2 text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-sky-100/40"
                disabled={transactions.page >= Math.max(transactions.total_pages, 1)}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: Math.min((current.page ?? 1) + 1, Math.max(transactions.total_pages, 1)),
                  }))
                }
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-sky-200/70">Categories</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Default model and edits</h3>
            </div>
            {editingCategoryId !== null ? (
              <button
                className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white"
                onClick={resetCategoryForm}
                type="button"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3">
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Category name"
              value={categoryForm.name}
            />
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  parent_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
              value={categoryForm.parent_id ?? ""}
            >
              <option value="">No parent</option>
              {categories
                .filter((category) => category.parent_id === null && category.id !== editingCategoryId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setCategoryForm((current) => ({ ...current, behavior_type: event.target.value }))}
              value={categoryForm.behavior_type}
            >
              <option value="group">Group</option>
              <option value="income">Income</option>
              <option value="fixed_expense">Fixed expense</option>
              <option value="variable_expense">Variable expense</option>
              <option value="saving">Saving</option>
              <option value="internal_transfer">Internal transfer</option>
              <option value="refund">Refund</option>
              <option value="excluded">Excluded</option>
            </select>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              min={0}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))
              }
              placeholder="Sort order"
              type="number"
              value={categoryForm.sort_order ?? 100}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-sky-100/75">
            {[
              ["is_essential", "Essential"],
              ["is_variable", "Variable"],
              ["is_income", "Income"],
              ["is_saving", "Saving"],
              ["is_excluded", "Excluded"],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-3">
                <input
                  checked={Boolean(categoryForm[field as keyof CategoryPayload])}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      [field]: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>

          <button
            className="mt-5 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
            disabled={saving || categoryForm.name.trim() === ""}
            onClick={() => void handleCategorySave()}
            type="button"
          >
            {editingCategoryId === null ? "Create category" : "Save category"}
          </button>

          <div className="mt-6 max-h-[320px] space-y-3 overflow-auto pr-1">
            {categories.map((category) => (
              <button
                key={category.id}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/25 hover:bg-white/10"
                onClick={() => {
                  setEditingCategoryId(category.id);
                  setCategoryForm({
                    name: category.name,
                    parent_id: category.parent_id,
                    behavior_type: category.behavior_type,
                    is_essential: category.is_essential,
                    is_variable: category.is_variable,
                    is_income: category.is_income,
                    is_saving: category.is_saving,
                    is_excluded: category.is_excluded,
                    sort_order: category.sort_order,
                  });
                }}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{formatCategoryLabel(category)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/60">{category.behavior_type}</p>
                  </div>
                  <span className="text-xs text-sky-100/55">#{category.sort_order}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-sky-200/70">Merchant rules</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Deterministic categorization</h3>
            </div>
            {editingRuleId !== null ? (
              <button
                className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white"
                onClick={resetRuleForm}
                type="button"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3">
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Rule name"
              value={ruleForm.name}
            />
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
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
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))}
              placeholder="Pattern"
              value={ruleForm.pattern}
            />
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              onChange={(event) =>
                setRuleForm((current) => ({ ...current, category_id: Number(event.target.value) || 0 }))
              }
              value={ruleForm.category_id}
            >
              {selectableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              min={0}
              onChange={(event) => setRuleForm((current) => ({ ...current, priority: Number(event.target.value) || 0 }))}
              placeholder="Priority"
              type="number"
              value={ruleForm.priority ?? 100}
            />
            <label className="flex items-center gap-3 text-sm text-sky-100/75">
              <input
                checked={Boolean(ruleForm.is_active)}
                onChange={(event) => setRuleForm((current) => ({ ...current, is_active: event.target.checked }))}
                type="checkbox"
              />
              Rule is active
            </label>
          </div>

          <button
            className="mt-5 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
            disabled={saving || ruleForm.name.trim() === "" || ruleForm.pattern.trim() === "" || ruleForm.category_id === 0}
            onClick={() => void handleRuleSave()}
            type="button"
          >
            {editingRuleId === null ? "Create rule" : "Save rule"}
          </button>

          <div className="mt-6 max-h-[320px] space-y-3 overflow-auto pr-1">
            {rules.length === 0 ? <p className="text-sm text-sky-100/70">No merchant rules yet.</p> : null}
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{rule.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-sky-100/60">
                      {rule.pattern_type} · priority {rule.priority} · {rule.is_active ? "active" : "inactive"}
                    </p>
                    <p className="mt-2 text-sm text-sky-50/78">
                      {rule.pattern} → {rule.category_name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white"
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
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-full border border-rose-300/20 px-3 py-2 text-xs uppercase tracking-[0.2em] text-rose-100"
                      onClick={() => void handleDeleteRule(rule.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
