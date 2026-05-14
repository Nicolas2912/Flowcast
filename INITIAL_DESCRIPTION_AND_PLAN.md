TL;DR: Build this as a forecasting-first finance app with clean import, editable assumptions, protected savings buckets, and scenario-based goal planning.

1. Product direction

The app should not just be a dashboard. It should become a personal finance simulation engine.

The core question is:

Given my real C24 transactions, known future payments, current balance, ETF savings rate, emergency fund target, and multiple goals, what can I afford, when, and under which trade-offs?

That means the app needs three layers:

Layer	Purpose
Actuals	Imported C24 transactions, categorized spending, current state
Assumptions	Income, fixed costs, subscriptions, variable spend baselines, savings rates
Simulation	Balance forecast, emergency fund plan, ETF protection, goal affordability scenarios

The UI in your screenshots is a good target: modern, card-based, analytical, with charts and editable scenario controls. But technically, the most important thing is not the dashboard. It is the data model and forecast logic behind it.

⸻

2. Recommended stack

Frontend

Use:

Vite + React + TypeScript
Tailwind CSS
shadcn/ui
Recharts or ECharts
TanStack Table
Zustand or TanStack Query

For your use case, I would prefer ECharts or Recharts over Plotly in the frontend. Plotly is powerful, but heavier and less visually integrated in a polished React dashboard. For the forecast line with hover effects, Recharts is enough. If you want very rich interactivity later, ECharts is stronger.

Backend

Use:

Python 3.11+
FastAPI
SQLite
SQLAlchemy or SQLModel
Pandas
Pydantic
Alembic

Do not put the logic directly into a frontend-only app. You need a proper backend because import parsing, categorization, forecasting, and persistence will become too complex.

Project structure

finance-app/
  backend/
    app/
      main.py
      db.py
      models/
      schemas/
      routers/
      services/
        import_service.py
        categorization_service.py
        recurring_service.py
        forecast_service.py
        goal_service.py
        scenario_service.py
      importers/
        c24_importer.py
      tests/
    alembic/
    pyproject.toml
  frontend/
    src/
      api/
      components/
      pages/
        DashboardPage.tsx
        TransactionsPage.tsx
        ForecastPage.tsx
        GoalsPage.tsx
        SetupPage.tsx
      features/
        transactions/
        goals/
        forecast/
        assumptions/
      lib/
    package.json

⸻

3. Core domain model

Account model

Even though you start with one C24 account, model accounts from day one.

accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL, -- c24 for now
  account_type TEXT, -- checking, savings, pocket, depot, credit_card
  currency TEXT DEFAULT 'EUR',
  opening_balance REAL DEFAULT 0,
  current_balance_manual REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

Why this matters: if you later add another bank account, C24 pocket, credit card, or depot, you do not want to redesign the whole app.

⸻

Transactions

transactions (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  booking_date TEXT NOT NULL,
  value_date TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'EUR',
  payee TEXT,
  purpose TEXT,
  original_text TEXT,
  normalized_text TEXT,
  category_id INTEGER,
  source_import_id INTEGER,
  is_internal_transfer INTEGER DEFAULT 0,
  is_excluded_from_forecast INTEGER DEFAULT 0,
  is_pending INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

Important: internal transfers must not distort income/spending. ETF transfers and emergency fund transfers are especially dangerous here. They are real cash movements, but not consumption.

⸻

Categories

Use parent categories. Otherwise the UI becomes noisy.

categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER,
  behavior_type TEXT NOT NULL,
  is_essential INTEGER DEFAULT 0,
  is_variable INTEGER DEFAULT 0,
  is_income INTEGER DEFAULT 0,
  is_saving INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 100
);

Example categories:

Parent	Child
Income	Salary
Housing	Rent
Food	Groceries
Food	Restaurants
Transport	Fuel
Savings	ETF
Savings	Notgroschen
Shopping	Electronics
Health	Gym
Travel	Vacation
Insurance	Car insurance

⸻

Manual fixed future payments

You explicitly want to manually specify yearly and quarterly spendings with exact date, name, and amount.

Use a broader table than “subscriptions”.

planned_payments (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_type TEXT NOT NULL, -- subscription, insurance, tax, yearly_bill, quarterly_bill, custom
  frequency TEXT NOT NULL, -- monthly, quarterly, yearly, one_time
  exact_date TEXT, -- for one-time or first occurrence
  day_of_month INTEGER,
  month_of_year INTEGER,
  category_id INTEGER,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

Examples:

Name	Amount	Frequency	Exact date
Amazon Prime	-44.90	yearly	2026-08-14
GEZ	-55.08	quarterly	2026-07-01
Car insurance	-411.06	yearly	2026-11-15
Netflix	-4.99	monthly	2026-06-05

⸻

Monthly spending assumptions

You want automatic extraction from the last three months, but manual editing must remain possible.

spending_assumptions (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL,
  calculation_method TEXT NOT NULL, -- auto_3m_avg, auto_3m_median, manual
  auto_monthly_amount REAL,
  manual_monthly_amount REAL,
  effective_monthly_amount REAL NOT NULL,
  last_recalculated_at TEXT,
  is_active INTEGER DEFAULT 1
);

The app should show:

Food: calculated €420/month, manually overridden to €450/month
Fuel: calculated €86/month, using automatic value
Restaurants: calculated €140/month, manually overridden to €100/month

This is critical because historical data is not always your intended future behavior.

⸻

Savings priorities

ETF and Notgroschen should be protected. They should not automatically be used for goals.

savings_buckets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, -- ETF, Notgroschen
  bucket_type TEXT NOT NULL, -- investment, emergency_fund, cash_savings
  current_amount REAL NOT NULL,
  target_amount REAL,
  monthly_contribution REAL NOT NULL,
  priority INTEGER NOT NULL,
  is_protected INTEGER DEFAULT 1,
  allow_scenario_withdrawal INTEGER DEFAULT 1
);

Recommended behavior:

Bucket	Priority	Protected	Can be used in scenario?
Notgroschen	1	Yes	Yes, only explicitly
ETF	2	Yes	Yes, only explicitly
Lifestyle goals	3+	No	Yes

The app should never silently say “use your Notgroschen for a laptop”. It may say:

Without touching ETF or Notgroschen, laptop is affordable in October 2026.
If you reduce ETF savings by €200/month and withdraw €300 from Notgroschen, laptop is affordable in July 2026, but emergency fund drops below target.

That distinction matters.

⸻

Goals

goals (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_amount REAL DEFAULT 0,
  priority INTEGER DEFAULT 100,
  goal_type TEXT, -- laptop, vacation, car, tv, custom
  target_date TEXT,
  funding_strategy TEXT DEFAULT 'after_protected_savings',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

Each goal needs a priority because multiple goals compete for the same free cash flow.

Example:

Goal	Amount	Current	Priority
Vacation	€3,000	€1,200	1
Laptop	€1,500	€1,050	2
TV	€1,000	€0	3
Car buffer	€2,500	€500	4

⸻

4. Forecasting logic

Baseline monthly cash flow

Calculate:

income
- fixed planned payments
- variable spending assumptions
- ETF contribution
- Notgroschen contribution
= protected free cash flow

Then:

protected free cash flow
- goal contributions
= remaining buffer

Important: “free cash flow” should not ignore ETF and Notgroschen. For your desired behavior, there are two useful values:

Metric	Meaning
Gross free cash flow	Money left after expenses before savings
Protected free cash flow	Money left after expenses, ETF, and Notgroschen
Scenario free cash flow	Money left after temporary scenario changes

This prevents bad advice.

⸻

Variable spending model

For each variable category:

effective monthly amount =
manual value if present
else average of last three full months

Use full months, not arbitrary last 90 days. The last 90 days can split months awkwardly and distort results.

Better:

last 3 complete calendar months

Example on May 18:

Use February, March, April
Do not use partial May as baseline

But display current-month tracking separately:

May spending so far: €X
Expected full month based on current pace: €Y
Three-month baseline: €Z

⸻

Forecast timeline

Generate a daily forecast for 12 months:

start_balance
+ income events
- planned payments
- daily variable spending
- ETF contribution events
- Notgroschen contribution events
- goal allocations
= projected balance

For charts, produce three lines:

Scenario	Meaning
Optimistic	variable spend at 85% of baseline
Expected	variable spend at 100%
Conservative	variable spend at 115%

This is better than one falsely precise line.

⸻

Goal affordability

For each goal, calculate:

remaining_goal_amount = target_amount - current_amount
monthly_available_for_goals = protected_free_cash_flow
months_to_goal = remaining_goal_amount / monthly_available_for_goals

But with multiple goals, simulate month-by-month by priority.

Example:

Month 1: Vacation gets €500
Month 2: Vacation gets €500
...
After vacation complete, laptop starts receiving free cash flow

This is more realistic than calculating each goal independently.

⸻

Scenario modeling

You specifically want:

* reduce ETF savings rate
* take amount Z from Notgroschen
* see when laptop or vacation becomes affordable
* still show the downside

Scenario inputs:

temporary ETF reduction
temporary Notgroschen contribution reduction
one-time Notgroschen withdrawal
goal priority change
variable spending multiplier
manual one-off expense
manual one-off income

Scenario output:

Goal affordable date
Projected lowest balance
Emergency fund after withdrawal
Months below emergency fund target
ETF contribution loss
Remaining monthly buffer
Risk level

Example result:

Laptop scenario:
- Base case: affordable in October 2026
- ETF reduced from €500 to €300/month: affordable in August 2026
- ETF reduced + €300 Notgroschen withdrawal: affordable in July 2026
- Downside: Notgroschen falls to €5,900 and returns to target in March 2027

That is the kind of advice your app should produce.

⸻

5. Detailed implementation phases with concrete issues

Below is a GitHub/Azure DevOps-style delivery plan.

⸻

Phase 1 — Project foundation

Issue 1.1 — Initialize monorepo structure

Description

Create a monorepo with separate backend and frontend folders. Backend uses FastAPI. Frontend uses Vite React TypeScript.

Tasks

* Create backend Python project.
* Create frontend Vite project.
* Add shared .env.example.
* Add README with startup commands.
* Add basic health check endpoint.
* Add frontend API health check display.

Acceptance criteria

* Running backend starts FastAPI on localhost:8000.
* Running frontend starts Vite on localhost:5173.
* Frontend can call /health.
* README explains local setup.
* No finance logic is implemented yet.

⸻

Issue 1.2 — Add SQLite database layer

Description

Set up SQLite connection, migrations, and initial schema management.

Tasks

* Add SQLAlchemy or SQLModel.
* Add Alembic migrations.
* Add database session handling.
* Add initial migration for base tables.
* Add seed script for default categories.

Acceptance criteria

* Database is created automatically locally.
* Migrations can be applied from CLI.
* Default categories are inserted once.
* Re-running seed does not create duplicates.
* Tests can use a temporary SQLite database.

⸻

Phase 2 — Account and category foundation

Issue 2.1 — Implement account model

Description

Support one C24 account now, but make the schema expandable.

Tasks

* Add accounts table.
* Add API endpoints:
    * GET /accounts
    * POST /accounts
    * PATCH /accounts/{id}
* Add default C24 account creation.

Acceptance criteria

* App starts with one default account if none exists.
* User can edit account name.
* Transactions must reference an account.
* Schema supports adding more accounts later.

⸻

Issue 2.2 — Implement category management

Description

Create category structure for income, fixed expenses, variable expenses, savings, and goals.

Tasks

* Add default parent and child categories.
* Add API:
    * GET /categories
    * POST /categories
    * PATCH /categories/{id}
* Add category type fields:
    * income
    * fixed expense
    * variable expense
    * saving
    * internal transfer

Acceptance criteria

* Categories are visible in frontend setup page.
* User can add/edit categories.
* Each category has behavior metadata.
* Forecast logic can identify variable spend categories.

⸻

Phase 3 — C24 CSV import

Issue 3.1 — Build C24 CSV parser

Description

Parse C24 CSV files with German formatting.

Tasks

* Detect delimiter ;.
* Parse German decimal commas.
* Parse dates with day-first format.
* Normalize column names.
* Preserve raw row data.
* Reject unsupported CSV format with clear error.

Acceptance criteria

* Valid C24 CSV imports successfully.
* Amounts like 1.234,56 are parsed correctly.
* Dates like 18.05.2025 are parsed correctly.
* Import fails gracefully if required columns are missing.
* Parser has unit tests with sample C24 rows.

⸻

Issue 3.2 — Implement raw import storage

Description

Every uploaded file should be traceable.

Tasks

* Add imports table.
* Store filename, import date, source provider, row count.
* Store raw row checksum.
* Link transactions to import ID.

Acceptance criteria

* Every import creates an import record.
* Transactions can be traced back to import.
* Duplicate uploads do not corrupt data.
* Import summary shows inserted, skipped, and failed rows.

⸻

Issue 3.3 — Implement duplicate detection

Description

Prevent duplicate transactions when overlapping CSV files are uploaded.

Tasks

* Generate transaction fingerprint using:
    * account ID
    * booking date
    * amount
    * payee
    * purpose
    * original text
* Use SHA-256 hash as transaction ID.
* Skip rows with existing IDs.
* Log skipped duplicates.

Acceptance criteria

* Uploading the same CSV twice creates no duplicates.
* Overlapping CSV exports only insert new transactions.
* Two similar transactions on same day are not incorrectly merged if purpose/original text differs.
* Import summary reports duplicate count.

⸻

Phase 4 — Transaction UI

Issue 4.1 — Build transactions page

Description

Create a table for imported transactions.

Tasks

* Show date, payee, purpose, amount, category, source account, status.
* Add search.
* Add date range filter.
* Add category filter.
* Add uncategorized filter.
* Add pagination.

Acceptance criteria

* User can inspect imported data.
* User can filter to uncategorized transactions.
* Table handles at least 5,000 transactions smoothly.
* Amounts display in German/Euro format.

⸻

Issue 4.2 — Manual category editing

Description

Allow user to manually assign or correct categories.

Tasks

* Add category dropdown per transaction.
* Add bulk category assignment.
* Store assignment method as manual.
* Optional: create merchant rule from manual assignment.

Acceptance criteria

* User can edit a transaction category.
* Edited category persists after reload.
* Manual category overrides automatic categorization.
* Bulk edit works for selected transactions.

⸻

Phase 5 — Categorization engine

Issue 5.1 — Merchant rule model

Description

Create deterministic categorization rules.

Tasks

* Add merchant_rules table.
* Support rule types:
    * exact
    * contains
    * regex
* Add priority.
* Add active/inactive flag.
* Add API for CRUD.

Acceptance criteria

* Rule priority determines match order.
* Inactive rules are ignored.
* Regex rules are validated before saving.
* Rules are editable in setup page.

⸻

Issue 5.2 — Deterministic categorization pass

Description

Categorize uncategorized transactions using merchant rules.

Tasks

* Normalize transaction text.
* Match payee + purpose + original text.
* Apply highest-priority rule.
* Store assignment method as merchant_rule.

Acceptance criteria

* Known merchants are categorized without AI.
* Existing manual categories are not overwritten.
* Categorization run reports number of matched transactions.
* Tests cover exact, contains, regex, and priority behavior.

⸻

Issue 5.3 — Optional LLM categorization suggestions

Description

Use AI only for remaining uncategorized transactions and only as suggestions.

Tasks

* Add backend service for LLM categorization.
* Send category list and transaction text.
* Require JSON output.
* Store confidence and method.
* Add review queue in frontend.

Acceptance criteria

* AI suggestions do not automatically become permanent rules.
* User can approve or reject suggestions.
* Approved suggestions update transaction categories.
* Only high-confidence, stable suggestions can optionally become merchant rules.
* App works without LLM configuration.

⸻

Phase 6 — Manual planned payments

Issue 6.1 — Planned payments model

Description

Allow user to manually enter yearly, quarterly, monthly, and one-time payments.

Tasks

* Add planned_payments table.
* Fields:
    * name
    * amount
    * frequency
    * exact date
    * category
    * account
    * active flag
* Add API CRUD.

Acceptance criteria

* User can add yearly insurance with exact date.
* User can add quarterly GEZ payment.
* User can add monthly subscription.
* User can deactivate a payment without deleting it.
* Planned payments appear in forecast.

⸻

Issue 6.2 — Planned payments setup UI

Description

Build the setup table shown in your screenshots.

Tasks

* Add planned payments table.
* Add “Add Payment” modal.
* Add edit/delete actions.
* Show next charge date.
* Show monthly equivalent cost.

Acceptance criteria

* User can manage all planned payments in UI.
* Next charge date is calculated correctly.
* Yearly/quarterly payments display their monthly equivalent.
* Total monthly equivalent is shown.

⸻

Phase 7 — Variable spending assumptions

Issue 7.1 — Calculate monthly category baselines

Description

Automatically calculate variable spending based on the last three complete months.

Tasks

* Identify variable categories.
* Exclude:
    * internal transfers
    * savings transfers
    * manually excluded transactions
    * planned fixed payments
* Calculate monthly average per variable category.
* Store result in spending_assumptions.

Acceptance criteria

* App calculates groceries, fuel, restaurants, shopping, etc.
* Calculation uses last three complete calendar months.
* Partial current month is not used for baseline.
* User can see which months were used.
* One-off excluded transactions do not affect baseline.

⸻

Issue 7.2 — Manual override for variable spending

Description

Allow the user to override calculated spending assumptions.

Tasks

* Add editable assumption table.
* Show calculated amount and effective amount.
* Support manual override.
* Support reverting to automatic calculation.

Acceptance criteria

* User can set fuel to €80/month manually.
* User can keep groceries automatic.
* Forecast uses effective amount, not always automatic amount.
* UI clearly shows whether value is automatic or manual.

⸻

Phase 8 — Savings buckets: ETF and Notgroschen

Issue 8.1 — Savings bucket model

Description

Represent ETF and emergency fund as protected savings buckets.

Tasks

* Add savings_buckets table.
* Create default buckets:
    * ETF
    * Notgroschen
* Fields:
    * current amount
    * target amount
    * monthly contribution
    * priority
    * protected flag

Acceptance criteria

* ETF and Notgroschen exist by default.
* User can edit current amount, target, and contribution.
* Both are marked as protected.
* Forecast treats their contributions as high-priority allocations.

⸻

Issue 8.2 — Emergency fund advice engine

Description

Give advice for filling the Notgroschen based on income, expenses, and ETF rate.

Tasks

* Calculate monthly essential expenses.
* Suggest emergency fund target:
    * 3 months essential expenses
    * 6 months essential expenses
* Calculate monthly contribution needed to reach target.
* Respect ETF savings rate.

Acceptance criteria

* App shows recommended Notgroschen target.
* App shows current gap to target.
* App estimates target completion date.
* App does not recommend using emergency fund for lifestyle goals unless user models it explicitly.

⸻

Phase 9 — Forecast engine

Issue 9.1 — Daily forecast timeline

Description

Generate daily projected balance for 12 months.

Tasks

* Start from current balance.
* Add income events.
* Subtract planned payments on exact dates.
* Subtract variable spending as daily average.
* Subtract ETF contribution.
* Subtract Notgroschen contribution.
* Support 90-day and 365-day output.

Acceptance criteria

* API returns daily forecast points.
* Forecast line dips on payment dates.
* Forecast includes uploaded latest transactions.
* Forecast updates after CSV import.
* Forecast updates after manual assumption changes.

⸻

Issue 9.2 — Forecast scenarios

Description

Support optimistic, expected, and conservative forecasts.

Tasks

* Add variable spending multipliers:
    * optimistic: 0.85
    * expected: 1.00
    * conservative: 1.15
* Return all three lines to frontend.
* Add risk metrics:
    * lowest projected balance
    * date of lowest balance
    * months below threshold
    * liquidity risk weeks

Acceptance criteria

* Forecast chart can display three scenarios.
* User can toggle lines.
* Risk alerts are generated.
* Tooltip shows date, balance, income, fixed costs, variable spend, savings, and planned payments.

⸻

Phase 10 — Goal planning

Issue 10.1 — Goal model and CRUD

Description

Allow multiple goals such as laptop, vacation, TV, car, etc.

Tasks

* Add goals table.
* Add API CRUD.
* Add goal priority.
* Add current saved amount.
* Add optional target date.

Acceptance criteria

* User can add multiple goals.
* User can reorder priorities.
* User can edit amount and saved value.
* Goals appear in dashboard and forecast page.

⸻

Issue 10.2 — Base goal affordability calculation

Description

Calculate when goals are affordable without touching protected ETF or Notgroschen.

Tasks

* Calculate protected free cash flow.
* Allocate available goal money by priority.
* Simulate month-by-month.
* Return estimated completion date per goal.

Acceptance criteria

* App shows when each goal becomes affordable.
* ETF contribution is not reduced.
* Notgroschen is not used.
* Multiple goals are handled sequentially by priority.
* If no free cash flow exists, app says goal is not reachable under current assumptions.

⸻

Issue 10.3 — Scenario-based goal planning

Description

Allow user to model reduced ETF saving rate and emergency fund withdrawal.

Tasks

* Add scenario inputs:
    * ETF contribution override
    * Notgroschen contribution override
    * one-time Notgroschen withdrawal
    * variable spending multiplier
    * goal priority changes
* Simulate goal dates under scenario.
* Compare base case vs scenario.

Acceptance criteria

* User can answer: “If I reduce ETF by €200/month and take €300 from Notgroschen, when can I buy the laptop?”
* App shows the earlier affordability date.
* App also shows the cost:
    * ETF contribution lost
    * emergency fund reduction
    * date emergency fund recovers
    * liquidity risk increase
* App never presents emergency fund usage as default advice.

⸻

Phase 11 — Dashboard UI

Issue 11.1 — Build dashboard shell

Description

Create the Vite frontend layout matching the provided visual direction.

Tasks

* Add sidebar.
* Add top header.
* Add page tabs:
    * Overview
    * Transactions
    * Forecast
    * Goals
    * Setup
* Add responsive card grid.
* Add design tokens.

Acceptance criteria

* UI visually resembles the provided screenshots.
* Layout is usable on desktop.
* Navigation between pages works.
* Sidebar shows:
    * current balance
    * monthly income
    * ETF rate
    * Notgroschen progress
    * latest import status

⸻

Issue 11.2 — Overview dashboard

Description

Show current financial state and short forecast summary.

Tasks

* Add cards:
    * Current balance
    * Monthly income
    * Monthly variable spend
    * Fixed planned payments
    * ETF contribution
    * Notgroschen contribution
    * Protected free cash flow
* Add category breakdown chart.
* Add goal tracker summary.
* Add upcoming payment risk chart.

Acceptance criteria

* Dashboard updates after CSV upload.
* User sees current state at a glance.
* Goal summary shows base affordability dates.
* Upcoming expensive weeks are highlighted.

⸻

Phase 12 — Forecast visualizations

Issue 12.1 — Projected balance line chart

Description

Create interactive balance forecast chart with hover effects.

Tasks

* Use Recharts or ECharts.
* Show expected forecast line.
* Optional toggles for optimistic/conservative.
* Show payment markers.
* Show warning threshold.
* Add tooltip.

Acceptance criteria

* Hover shows detailed daily breakdown.
* Planned payments are visible as markers.
* Chart supports 90 days, 6 months, 12 months.
* Chart updates when scenario controls change.
* Chart clearly displays projected balance over time.

⸻

Issue 12.2 — Monthly free cash flow chart

Description

Show monthly remaining cash after all obligations and protected savings.

Tasks

* Aggregate forecast by month.
* Show income, spending, savings, and remaining buffer.
* Highlight negative months.

Acceptance criteria

* User can identify weak months.
* Months with large yearly/quarterly bills are visible.
* Chart distinguishes expenses from savings allocations.
* Tooltip explains each monthly value.

⸻

Issue 12.3 — Liquidity threat calendar

Description

Show weeks with high planned outflows.

Tasks

* Aggregate planned payments weekly.
* Add threshold for high-risk weeks.
* Show bills included in each week.
* Highlight weeks where projected balance drops strongly.

Acceptance criteria

* User can see bill concentration weeks.
* Hover shows payment names and amounts.
* High-risk weeks are visually distinct.
* Risk cards summarize the most important warnings.

⸻

Phase 13 — Setup page

Issue 13.1 — Build setup page

Description

Create central management page for goals, planned payments, categories, rules, and assumptions.

Tasks

* Goals table.
* Planned payments table.
* Merchant rules table.
* Variable spending assumptions table.
* Savings bucket configuration.

Acceptance criteria

* User can manage all forecast inputs from one page.
* Changes are persisted.
* Forecast updates after changes.
* Setup page shows database status:
    * transaction count
    * categories
    * rules
    * planned payments
    * last import

⸻

Phase 14 — Import refresh behavior

Issue 14.1 — Recalculate app state after CSV upload

Description

After every successful upload, all dependent values must refresh.

Tasks

* Import transactions.
* Run deterministic categorization.
* Recalculate variable spending baselines.
* Recalculate current month summary.
* Recalculate forecast.
* Recalculate goal dates.

Acceptance criteria

* Uploading a new CSV updates dashboard numbers.
* Duplicate rows are skipped.
* New transactions influence monthly spend baselines where appropriate.
* New latest balance is reflected.
* Goal affordability dates update automatically.

⸻

Phase 15 — Advice engine

Issue 15.1 — Generate financial advice cards

Description

Create deterministic advice based on forecast results.

Tasks

* Add rule-based advice engine.
* Advice examples:
    * emergency fund below target
    * ETF rate too high for current liquidity
    * goal not reachable
    * yearly bill creates risk month
    * variable spending category above baseline
    * safe monthly amount for goals
* No LLM required initially.

Acceptance criteria

* Advice is explainable.
* Each advice card links to the underlying numbers.
* App does not make vague motivational statements.
* Advice changes when scenario inputs change.

Example:

Your Notgroschen target is €10,000 and current balance is €6,200.
At €400/month, you reach the target in March 2026.
Reducing ETF savings is not required under the expected forecast.

⸻

6. Key calculation definitions

Protected free cash flow

Protected FCF =
monthly income
- fixed planned payments
- variable spending assumptions
- ETF contribution
- Notgroschen contribution

This is the money available for lifestyle goals without weakening your financial foundation.

Scenario free cash flow

Scenario FCF =
monthly income
- fixed planned payments
- variable spending assumptions × scenario multiplier
- scenario ETF contribution
- scenario Notgroschen contribution

Emergency fund target

Emergency fund target =
essential monthly expenses × target months

Where essential expenses include:

rent
utilities
insurance
groceries
fuel/transport minimum
phone/internet
mandatory fees

It should not include:

ETF savings
vacation
shopping
restaurants
entertainment
laptop

Goal affordability

remaining goal amount = target amount - current saved amount
months to goal = remaining goal amount / available monthly goal allocation

But for multiple goals, use monthly simulation by priority rather than a simple independent formula.

⸻

7. Important edge cases

These should be handled deliberately.

Edge case	Required behavior
Duplicate CSV upload	Skip existing transactions
Partial current month	Do not use as baseline month
Salary appears twice	Detect as income, do not average weirdly
Internal transfer to ETF	Treat as savings allocation, not consumption
Transfer to Notgroschen	Treat as savings allocation
Refund	Reduce category spending or mark separately
Cash withdrawal	Category should be manual or excluded until clarified
Amazon transactions	Do not create broad permanent rule too aggressively
One-time laptop purchase	Exclude from recurring baseline unless user wants otherwise
Negative protected FCF	Goals should show “not reachable under current assumptions”
Notgroschen withdrawal scenario	Show recovery date and risk impact

⸻

8. MVP scope

For the first working version, build only this:

1. C24 CSV import.
2. One default account.
3. Transaction list with manual categorization.
4. Merchant rules.
5. Manual planned payments.
6. Automatic 3-month variable spending assumptions.
7. Manual assumption overrides.
8. ETF and Notgroschen buckets.
9. Multiple goals.
10. 12-month forecast line.
11. Base vs scenario goal affordability.

Do not add LLM categorization in the first iteration. It is not essential. Manual rules are more valuable early because they make the financial engine trustworthy.

⸻

9. Best next technical issue to start with

Start with this issue:

Issue 0 — Define financial calculation contract

Description

Before coding UI, define the exact calculation rules for income, expenses, savings, emergency fund, goals, and scenarios.

Acceptance criteria

* There is a written calculation_contract.md.
* It defines:
    * gross free cash flow
    * protected free cash flow
    * scenario free cash flow
    * emergency fund target
    * variable spending baseline
    * goal priority allocation
    * treatment of ETF transfers
    * treatment of Notgroschen transfers
    * treatment of internal transfers
* Backend unit tests are written from this contract.

This sounds boring, but it prevents the app from becoming a visually polished calculator with wrong assumptions.
