import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { Card } from "../ui/card";
import {
  fetchAccounts,
  fetchImports,
  HttpError,
  type AccountResponse,
  type ImportBatchResponse,
  type ImportSummaryResponse,
  uploadC24Csv,
} from "../../lib/api";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function ImportPanel() {
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [imports, setImports] = useState<ImportBatchResponse[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummaryResponse | null>(null);

  async function loadImportData() {
    setLoading(true);
    setError(null);

    try {
      const [accountsResponse, importsResponse] = await Promise.all([fetchAccounts(), fetchImports()]);
      setAccounts(accountsResponse);
      setImports(importsResponse);
      setSelectedAccountId((current) => current ?? accountsResponse[0]?.id ?? null);
    } catch (caughtError) {
      if (caughtError instanceof HttpError) {
        setError(`${caughtError.payload.error.message} (${caughtError.payload.error.code})`);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("The import panel could not load.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadImportData();
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || selectedAccountId === null) {
      setError("Select an account and choose a CSV file first.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const importSummary = await uploadC24Csv(selectedFile, selectedAccountId);
      setSummary(importSummary);
      setSelectedFile(null);
      await loadImportData();
    } catch (caughtError) {
      if (caughtError instanceof HttpError) {
        setError(`${caughtError.payload.error.message} (${caughtError.payload.error.code})`);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("The import failed.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">FLO-3 import</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Upload a C24 CSV</h2>
          <p className="mt-3 text-sm leading-7 text-sky-50/75">
            The importer keeps the raw batch metadata, links each accepted transaction to its source
            upload, and reports duplicates and failed rows directly.
          </p>
        </div>

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-2 block text-sm text-sky-100/80">Account</span>
            <select
              className="w-full rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-white outline-none"
              disabled={loading || accounts.length === 0}
              onChange={(event) => setSelectedAccountId(Number(event.target.value))}
              value={selectedAccountId ?? ""}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.provider.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-sky-100/80">CSV file</span>
            <input
              accept=".csv,text/csv"
              className="block w-full rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-4 text-sm text-sky-50/85 file:mr-4 file:rounded-full file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              onChange={handleFileChange}
              type="file"
            />
          </label>

          <button
            className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/60"
            disabled={uploading || loading || !selectedFile || selectedAccountId === null}
            type="submit"
          >
            {uploading ? "Importing..." : "Import transactions"}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {summary ? (
          <div className="mt-6 rounded-[24px] border border-emerald-300/15 bg-emerald-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-emerald-200/70">Latest result</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{summary.source_filename}</h3>
                <p className="mt-2 text-sm text-sky-50/75">
                  Imported {formatTimestamp(summary.imported_at)} · delimiter {summary.delimiter ?? "unknown"}
                </p>
              </div>
              <div className="rounded-full border border-white/15 px-4 py-2 text-sm text-white">
                {summary.status}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Inserted" value={summary.inserted_count} />
              <Stat label="Duplicates" value={summary.duplicate_count} />
              <Stat label="Skipped" value={summary.skipped_count} />
              <Stat label="Failed" value={summary.failed_count} />
            </div>

            {summary.failures.length > 0 ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-medium text-white">Failed rows</p>
                {summary.failures.map((failure) => (
                  <div key={`${failure.row_number}-${failure.error_message}`} className="rounded-2xl bg-slate-950/45 p-4">
                    <p className="text-sm font-medium text-amber-200">
                      Row {failure.row_number}: {failure.error_message}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-sky-50/70">
                      {failure.raw_row_json}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Audit trail</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Recent imports</h2>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            onClick={() => void loadImportData()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {loading ? <p className="text-sm text-sky-100/70">Loading import history...</p> : null}
        {!loading && imports.length === 0 ? (
          <p className="text-sm text-sky-100/70">No CSV imports yet.</p>
        ) : null}

        <div className="space-y-3">
          {imports.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.source_filename}</p>
                  <p className="mt-1 text-xs text-sky-50/70">
                    {formatTimestamp(item.imported_at)} · {item.provider.toUpperCase()} · {item.delimiter ?? "?"}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-sky-100/80">
                  {item.status}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Stat label="Rows" value={item.transaction_count} />
                <Stat label="Inserted" value={item.inserted_count} />
                <Stat label="Duplicates" value={item.duplicate_count} />
                <Stat label="Failed" value={item.failed_count} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/6 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-sky-100/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
