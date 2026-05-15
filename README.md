# Flowcast

Flowcast is a forecasting-first personal finance app. This repository now contains the MVP technical foundation for a local-first monorepo with a FastAPI backend, SQLite persistence, Alembic migrations, and a Vite React frontend.

## Project structure

```text
Flowcast/
├── backend/                # FastAPI app, schemas, models, tests
├── frontend/               # Vite React TypeScript app
├── alembic/                # Database migrations
├── fixtures/               # Example product fixtures from FLO-1
├── calculation_contract.md
├── product_data_boundaries_and_privacy.md
└── INITIAL_DESCRIPTION_AND_PLAN.md
```

## Requirements

- Python 3.9+
- Node.js 20+
- pnpm 10+

## Backend setup

1. Create a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install backend dependencies:

```bash
pip install -e 'backend[dev]'
```

3. Copy the example environment file if you want a custom database path:

```bash
cp .env.example .env
```

4. Apply migrations and seed default data:

```bash
alembic upgrade head
flowcast-seed
```

5. Start the backend on port `8000`:

```bash
uvicorn app.main:app --app-dir backend --reload --port 8000
```

## Frontend setup

1. Install frontend dependencies:

```bash
cd frontend
pnpm install
```

2. Start the frontend on port `5173`:

```bash
pnpm dev
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8000`.

## Importing a C24 CSV

You can keep exported C24 files in a local-only folder such as `data/imports/`.
That directory is ignored by Git so your personal finance data stays out of the
repository history.

Current import flow:

1. Start the backend and frontend.
2. Open the frontend.
3. Use the import panel to choose the seeded default account and upload your
   exported C24 CSV.

The importer currently:

- detects comma and semicolon-delimited exports,
- parses German currency and day-first dates,
- stores import-batch metadata and provenance,
- skips duplicate transactions across repeated or overlapping uploads,
- shows inserted, duplicate, skipped, and failed row counts.

## Reviewing and categorizing transactions

After importing a CSV, the frontend transaction workspace lets you:

- search by payee, purpose, or normalized text,
- filter by account, category, date range, or uncategorized-only,
- page through larger transaction sets without loading everything at once,
- assign a category to a single transaction,
- assign one category to multiple selected rows in bulk,
- create and edit category defaults,
- create deterministic merchant rules with exact, contains, and regex matching,
- run merchant rules without overwriting manual choices.

Deterministic categorization behavior:

- manual assignments are stored separately and win over automated rules,
- manual clearing of a category is also preserved,
- active rules run by priority from lowest number to highest,
- regex rules are validated before they can be saved,
- rule matching uses normalized transaction text built from payee, purpose, and raw import text.

## Common commands

### Backend

```bash
pytest backend/tests
alembic upgrade head
flowcast-seed
```

### Frontend

```bash
cd frontend
pnpm typecheck
pnpm build
```

## Current foundation

- `GET /api/v1/health` provides backend and database health.
- `POST /api/v1/imports/c24` imports a C24 CSV and returns a full import summary.
- `GET /api/v1/categories` plus `POST/PATCH /api/v1/categories` manage the seeded category model.
- `GET /api/v1/transactions` provides filtered, paginated transaction review data.
- `PATCH /api/v1/transactions/{id}/category` and `POST /api/v1/transactions/bulk-category` support manual categorization.
- `GET/POST/PATCH/DELETE /api/v1/merchant-rules` and `POST /api/v1/merchant-rules/apply` support deterministic categorization.
- API errors use one response shape for validation, not-found, and database failures.
- SQLite schema covers accounts, categories, imports, transactions, planned payments, savings buckets, goals, assumptions, and app settings.
- Default seed data creates one C24 account and a parent-child category hierarchy without duplicates.
- Frontend now includes a typed transaction workspace with filtering, manual fixes, bulk edits, and merchant-rule management.

## Notes

- The first charting decision is intentionally left as a placeholder in the frontend. The current UI is ready to host Recharts later without reworking the app shell.
- The app is local-first. Nothing in this foundation requires a remote service.
