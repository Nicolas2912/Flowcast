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

export class HttpError extends Error {
  payload: ApiError;

  constructor(payload: ApiError) {
    super(payload.error.message);
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
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
