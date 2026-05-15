export type ApiError = {
  error: {
    code: string;
    message: string;
    details: Array<Record<string, string>>;
    request_id: string;
  };
};

export type HealthResponse = {
  status: string;
  app: string;
  version: string;
  environment: string;
  database: string;
};

export type AccountResponse = {
  id: number;
  name: string;
  provider: string;
  account_type: string | null;
  currency: string;
  opening_balance: number;
  current_balance_manual: number | null;
  is_active: boolean;
};

export type CategoryResponse = {
  id: number;
  name: string;
  parent_id: number | null;
  parent_name: string | null;
  behavior_type: string;
  is_essential: boolean;
  is_variable: boolean;
  is_income: boolean;
  is_saving: boolean;
  is_excluded: boolean;
  sort_order: number;
};

export type CategoryPayload = {
  name: string;
  parent_id: number | null;
  behavior_type: string;
  is_essential?: boolean;
  is_variable?: boolean;
  is_income?: boolean;
  is_saving?: boolean;
  is_excluded?: boolean;
  sort_order?: number;
};

export type ImportFailureResponse = {
  row_number: number;
  error_message: string;
  raw_row_json: string;
};

export type ImportSummaryResponse = {
  import_batch_id: number;
  source_filename: string;
  provider: string;
  status: string;
  delimiter: string | null;
  transaction_count: number;
  inserted_count: number;
  duplicate_count: number;
  skipped_count: number;
  failed_count: number;
  imported_at: string;
  failures: ImportFailureResponse[];
};

export type ImportBatchResponse = {
  id: number;
  source_filename: string;
  provider: string;
  status: string;
  delimiter: string | null;
  transaction_count: number;
  inserted_count: number;
  duplicate_count: number;
  skipped_count: number;
  failed_count: number;
  imported_at: string;
};

export type TransactionResponse = {
  id: string;
  booking_date: string;
  value_date: string | null;
  amount: number;
  currency: string;
  payee: string | null;
  purpose: string | null;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  category_assignment_method: string | null;
  source_import_id: number | null;
  source_import_filename: string | null;
  is_excluded_from_forecast: boolean;
  is_pending: boolean;
};

export type TransactionListResponse = {
  items: TransactionResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type TransactionFilters = {
  page?: number;
  page_size?: number;
  search?: string;
  account_id?: number | null;
  category_id?: number | null;
  uncategorized_only?: boolean;
  date_from?: string;
  date_to?: string;
};

export type MerchantRuleResponse = {
  id: number;
  name: string;
  pattern_type: "exact" | "contains" | "regex";
  pattern: string;
  category_id: number;
  category_name: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannedPaymentResponse = {
  id: number;
  account_id: number;
  account_name: string;
  name: string;
  amount: number;
  payment_type: string;
  frequency: "monthly" | "quarterly" | "yearly" | "one_time";
  exact_date: string | null;
  day_of_month: number | null;
  month_of_year: number | null;
  category_id: number | null;
  category_name: string | null;
  is_active: boolean;
  notes: string | null;
  next_charge_date: string | null;
  monthly_equivalent: number;
  created_at: string;
  updated_at: string;
};

export type PlannedPaymentPayload = {
  account_id: number;
  name: string;
  amount: number;
  payment_type: string;
  frequency: "monthly" | "quarterly" | "yearly" | "one_time";
  exact_date?: string | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  category_id?: number | null;
  is_active?: boolean;
  notes?: string | null;
};

export type SpendingAssumptionResponse = {
  id: number;
  category_id: number;
  category_name: string;
  calculation_method: string;
  auto_monthly_amount: number | null;
  manual_monthly_amount: number | null;
  effective_monthly_amount: number;
  last_recalculated_at: string | null;
  is_active: boolean;
  baseline_months: string[];
  baseline_month_count: number;
  confidence: string;
};

export type MerchantRulePayload = {
  name: string;
  pattern_type: "exact" | "contains" | "regex";
  pattern: string;
  category_id: number;
  priority?: number;
  is_active?: boolean;
};

export type CategorizationRunResponse = {
  processed_count: number;
  matched_count: number;
  updated_count: number;
  cleared_count: number;
};

export type SavingsBucketResponse = {
  id: number;
  name: string;
  bucket_type: "etf" | "emergency_fund" | string;
  current_amount: number;
  target_amount: number | null;
  monthly_contribution: number;
  priority: number;
  is_protected: boolean;
  allow_scenario_withdrawal: boolean;
  progress_ratio: number | null;
  target_gap: number | null;
  forecast_reserved_amount: number;
};

export type SavingsBucketUpdatePayload = {
  current_amount?: number;
  target_amount?: number | null;
  monthly_contribution?: number;
  priority?: number;
  is_protected?: boolean;
  allow_scenario_withdrawal?: boolean;
};

export type EssentialExpenseLineItemResponse = {
  label: string;
  source_type: string;
  monthly_amount: number;
};

export type SavingsPlanSummaryResponse = {
  protected_current_amount: number;
  protected_monthly_contribution: number;
  forecast_reserved_current_amount: number;
  essential_monthly_expenses: number;
  essential_breakdown: EssentialExpenseLineItemResponse[];
  three_month_target: number;
  six_month_target: number;
  emergency_fund_current_amount: number;
  emergency_fund_monthly_contribution: number;
  emergency_fund_target_amount: number | null;
  gap_to_current_target: number | null;
  gap_to_three_month_target: number;
  gap_to_six_month_target: number;
  target_completion_date: string | null;
  three_month_completion_date: string | null;
  six_month_completion_date: string | null;
  scenario_withdrawal_allowed: boolean;
  scenario_withdrawal_amount: number;
  scenario_remaining_amount: number;
  scenario_recovery_date_to_current_target: string | null;
  scenario_recovery_date_to_three_month_target: string | null;
  scenario_recovery_date_to_six_month_target: string | null;
};

export class HttpError extends Error {
  payload: ApiError;

  constructor(payload: ApiError) {
    super(payload.error.message);
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new HttpError((await response.json()) as ApiError);
  }

  return (await response.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/v1/health");
}

export function fetchAccounts(): Promise<AccountResponse[]> {
  return request<AccountResponse[]>("/api/v1/accounts");
}

export function fetchCategories(): Promise<CategoryResponse[]> {
  return request<CategoryResponse[]>("/api/v1/categories");
}

export function createCategory(payload: CategoryPayload): Promise<CategoryResponse> {
  return request<CategoryResponse>("/api/v1/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCategory(id: number, payload: Partial<CategoryPayload>): Promise<CategoryResponse> {
  return request<CategoryResponse>(`/api/v1/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchImports(): Promise<ImportBatchResponse[]> {
  return request<ImportBatchResponse[]>("/api/v1/imports");
}

export function uploadC24Csv(file: File, accountId: number): Promise<ImportSummaryResponse> {
  const body = new FormData();
  body.append("account_id", String(accountId));
  body.append("file", file);

  return request<ImportSummaryResponse>("/api/v1/imports/c24", {
    method: "POST",
    body,
  });
}

export function fetchTransactions(filters: TransactionFilters): Promise<TransactionListResponse> {
  const params = new URLSearchParams();
  if (filters.page) {
    params.set("page", String(filters.page));
  }
  if (filters.page_size) {
    params.set("page_size", String(filters.page_size));
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.account_id) {
    params.set("account_id", String(filters.account_id));
  }
  if (filters.category_id) {
    params.set("category_id", String(filters.category_id));
  }
  if (filters.uncategorized_only) {
    params.set("uncategorized_only", "true");
  }
  if (filters.date_from) {
    params.set("date_from", filters.date_from);
  }
  if (filters.date_to) {
    params.set("date_to", filters.date_to);
  }
  const query = params.toString();
  return request<TransactionListResponse>(`/api/v1/transactions${query ? `?${query}` : ""}`);
}

export function updateTransactionCategory(transactionId: string, categoryId: number | null): Promise<TransactionResponse> {
  return request<TransactionResponse>(`/api/v1/transactions/${transactionId}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category_id: categoryId }),
  });
}

export function fetchSavingsBuckets(): Promise<SavingsBucketResponse[]> {
  return request<SavingsBucketResponse[]>("/api/v1/savings-buckets");
}

export function updateSavingsBucket(
  bucketId: number,
  payload: SavingsBucketUpdatePayload,
): Promise<SavingsBucketResponse> {
  return request<SavingsBucketResponse>(`/api/v1/savings-buckets/${bucketId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchSavingsSummary(
  scenarioWithdrawalAmount?: number,
): Promise<SavingsPlanSummaryResponse> {
  const query =
    typeof scenarioWithdrawalAmount === "number"
      ? `?scenario_withdrawal_amount=${encodeURIComponent(String(scenarioWithdrawalAmount))}`
      : "";
  return request<SavingsPlanSummaryResponse>(`/api/v1/savings-buckets/summary${query}`);
}

export function updateTransactionForecastSettings(
  transactionId: string,
  payload: { is_excluded_from_forecast: boolean },
): Promise<TransactionResponse> {
  return request<TransactionResponse>(`/api/v1/transactions/${transactionId}/forecast-settings`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function bulkUpdateTransactionCategory(
  transactionIds: string[],
  categoryId: number | null,
): Promise<{ updated_count: number }> {
  return request<{ updated_count: number }>("/api/v1/transactions/bulk-category", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds, category_id: categoryId }),
  });
}

export function fetchMerchantRules(): Promise<MerchantRuleResponse[]> {
  return request<MerchantRuleResponse[]>("/api/v1/merchant-rules");
}

export function createMerchantRule(payload: MerchantRulePayload): Promise<MerchantRuleResponse> {
  return request<MerchantRuleResponse>("/api/v1/merchant-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMerchantRule(
  id: number,
  payload: Partial<MerchantRulePayload> & { is_active?: boolean },
): Promise<MerchantRuleResponse> {
  return request<MerchantRuleResponse>(`/api/v1/merchant-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteMerchantRule(id: number): Promise<void> {
  const response = await fetch(`/api/v1/merchant-rules/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new HttpError((await response.json()) as ApiError);
  }
}

export function runMerchantRules(): Promise<CategorizationRunResponse> {
  return request<CategorizationRunResponse>("/api/v1/merchant-rules/apply", {
    method: "POST",
  });
}

export function fetchPlannedPayments(): Promise<PlannedPaymentResponse[]> {
  return request<PlannedPaymentResponse[]>("/api/v1/planned-payments");
}

export function createPlannedPayment(payload: PlannedPaymentPayload): Promise<PlannedPaymentResponse> {
  return request<PlannedPaymentResponse>("/api/v1/planned-payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePlannedPayment(
  id: number,
  payload: Partial<PlannedPaymentPayload>,
): Promise<PlannedPaymentResponse> {
  return request<PlannedPaymentResponse>(`/api/v1/planned-payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchSpendingAssumptions(): Promise<SpendingAssumptionResponse[]> {
  return request<SpendingAssumptionResponse[]>("/api/v1/spending-assumptions");
}

export function recalculateSpendingAssumptions(): Promise<SpendingAssumptionResponse[]> {
  return request<SpendingAssumptionResponse[]>("/api/v1/spending-assumptions/recalculate", {
    method: "POST",
  });
}

export function updateSpendingAssumption(
  id: number,
  payload: { manual_monthly_amount?: number | null; revert_to_automatic?: boolean },
): Promise<SpendingAssumptionResponse> {
  return request<SpendingAssumptionResponse>(`/api/v1/spending-assumptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
