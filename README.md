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

## Modeling future obligations and spending assumptions

The planning workspace now covers the next input layer for forecasting:

- planned payments can be entered as monthly, quarterly, yearly, or one-time obligations,
- each planned payment exposes its next charge date and monthly equivalent,
- planned payments can be deactivated without deleting their history,
- variable spending assumptions are derived from the last three complete calendar months when available,
- the partial current month is excluded from the default baseline,
- one-off transactions can be excluded from the baseline by marking them excluded in the transaction table,
- manual assumption overrides can replace the automatic baseline and later revert back to automatic.

Current baseline behavior:

- only variable expense categories are used,
- excluded transactions and internal transfers are skipped,
- fixed planned payments do not affect variable spending baselines,
- the UI shows automatic amount, manual amount, effective amount, baseline months used, and confidence.

## Protecting ETF and emergency fund savings

The savings workspace now adds the last major input layer before the forecast
engine itself:

- default `ETF` and `Notgroschen` buckets are created automatically,
- both buckets store current amount, target amount, monthly contribution,
  priority, protection state, and scenario-withdrawal permission,
- protected savings expose a reserved-current-cash value for later forecast
  logic,
- emergency-fund targets are derived from essential planned payments plus
  essential spending assumptions,
- the UI shows current target, three-month target, six-month target, and
  recovery dates after a hypothetical withdrawal.

Current emergency-fund behavior:

- target suggestions use categories already marked essential,
- monthly rent or utility-style obligations only count if they exist as planned
  payments,
- essential variable categories come from the spending-assumption layer,
- recovery dates are estimated from the current Notgroschen amount and monthly
  contribution,
- protected buckets are documented as unavailable for automatic goal spending.

## Building forecast lines and goal simulations

The forecast workspace now adds the main product engine:

- the backend returns deterministic daily forecast points for 90 days, 6 months,
  and 12 months,
- default optimistic, expected, and conservative scenarios vary only the
  variable spending layer,
- the forecast includes trusted current balance, recurring income, planned
  payments, variable spending, protected savings contributions, and month-end
  goal allocations,
- multiple lifestyle goals can be created with saved progress, priority,
  funding strategy, and optional target dates,
- a custom scenario endpoint compares one-off expenses, one-off income,
  contribution overrides, emergency-fund withdrawals, and temporary goal
  priority changes against the base case.

Current forecast behavior:

- income events come from planned income payments when present, otherwise from
  recurring historical income transactions,
- variable spending uses the derived spending assumptions that already power the
  planning workspace,
- protected savings remain reserved before goal funding is allocated,
- goal funding runs at month end and supports both `priority` and `parallel`
  strategies,
- imports and forecast-relevant transaction edits refresh derived values
  immediately so the forecast reflects current data without a restart.

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
- `PATCH /api/v1/transactions/{id}/forecast-settings` controls per-transaction forecast exclusion.
- `GET/POST/PATCH /api/v1/planned-payments` manage manual future obligations with next-charge and monthly-equivalent output.
- `GET/POST /api/v1/spending-assumptions` plus `PATCH /api/v1/spending-assumptions/{id}` manage derived and manual variable-spend assumptions.
- `GET/PATCH /api/v1/savings-buckets` plus `GET /api/v1/savings-buckets/summary` manage protected savings inputs and emergency-fund target calculations.
- `GET/POST/PATCH /api/v1/goals` manage lifestyle goals and saved progress.
- `GET /api/v1/forecast` returns optimistic, expected, and conservative daily forecast lines for all supported horizons.
- `POST /api/v1/forecast/scenario` compares a custom trade-off scenario against the base case.
- `GET/POST/PATCH/DELETE /api/v1/merchant-rules` and `POST /api/v1/merchant-rules/apply` support deterministic categorization.
- API errors use one response shape for validation, not-found, and database failures.
- SQLite schema covers accounts, categories, imports, transactions, planned payments, savings buckets, goals, assumptions, and app settings.
- Default seed data creates one C24 account and a parent-child category hierarchy without duplicates.
- Frontend now includes typed workspaces for imports, transaction review, planned payments, spending assumptions, protected savings, and forecast/goal simulation.

## Notes

- The first charting decision is intentionally left as a placeholder in the frontend. The current UI is ready to host Recharts later without reworking the app shell.
- The app is local-first. Nothing in this foundation requires a remote service.
