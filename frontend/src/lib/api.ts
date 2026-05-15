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
