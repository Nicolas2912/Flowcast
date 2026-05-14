
# calculation_contract.md
# Flowcast Calculation Contract
## 1. Purpose
This document defines the calculation behavior for Flowcast, a forecasting-first personal finance app.
Flowcast must answer one core product question:
> What can I safely afford, when, and under which trade-offs?
This contract is the source of truth for:
- backend calculation logic,
- backend test fixtures,
- frontend labels and explanations,
- scenario behavior,
- risk warnings,
- financial forecast outputs,
- product decisions around affordability.
The contract controls how Flowcast treats imported bank transactions, user-entered assumptions, savings buckets, goals, planned payments, and scenario overrides.
It does not provide legal, tax, or investment advice. It defines product behavior only.
---
## 2. Core Principles
### 2.1 Forecast correctness before UI polish
The forecast engine must be correct, explainable, and testable before visual refinement.
A visually polished forecast that mixes actuals, assumptions, and scenario values incorrectly is a product failure.
### 2.2 Separate actual transactions, assumptions, and scenarios
Flowcast must keep the following data types separate:
- imported actual transactions,
- manually entered assumptions,
- derived assumptions,
- scenario overrides.
A scenario must never overwrite the base case.
A derived assumption must never overwrite an imported actual transaction.
A manual assumption must never silently replace an imported actual transaction unless the user explicitly excludes or overrides the transaction.
### 2.3 ETF and Notgroschen are protected by default
ETF contributions and Notgroschen contributions are treated as protected savings by default.
Protected savings are not part of lifestyle spending capacity.
### 2.4 Protected savings may not be used for lifestyle goals unless explicitly modeled
Flowcast must not automatically suggest using ETF savings or Notgroschen funds for lifestyle goals.
Examples of lifestyle goals:
- laptop,
- vacation,
- gaming PC,
- furniture,
- festival ticket,
- camera,
- car upgrade.
Protected savings may only be used if the user explicitly creates a scenario such as:
- reduce ETF contribution,
- pause ETF contribution,
- reduce Notgroschen contribution,
- withdraw one-time amount from Notgroschen.
### 2.5 Every forecast result must be explainable from inputs
Every forecast value must be explainable through:
- imported actual transactions,
- manually entered assumptions,
- derived assumptions,
- planned payments,
- savings bucket settings,
- goal settings,
- scenario overrides.
The frontend must be able to show why a forecast result exists.
Example explanation:
> Your lowest projected balance is 842.00 € on 2026-07-28 because rent, ETF contribution, Notgroschen contribution, and a yearly insurance payment occur before the next salary payment.
---
## 3. Data Sources and Trust Levels
Flowcast uses multiple data sources with different trust levels.
### 3.1 Imported actual transactions
Imported actual transactions come from C24 CSV files.
They represent real historical account movements.
Examples:
- salary received,
- rent paid,
- supermarket payment,
- ETF transfer,
- insurance payment,
- refund,
- cash withdrawal.
Imported actual transactions are the highest-trust source for historical periods.
### 3.2 Manually entered assumptions
Manually entered assumptions are user-defined values for future or recurring behavior.
Examples:
- monthly rent of 780.00 €,
- yearly car insurance of 822.12 € paid on 2026-11-15,
- quarterly trainer fee of 4.98 €,
- monthly ETF contribution of 300.00 €,
- monthly Notgroschen contribution of 150.00 €,
- vacation goal of 2,000.00 € by 2026-09-01.
Manual assumptions are the highest-trust source for future planned behavior.
### 3.3 Derived assumptions
Derived assumptions are calculated by Flowcast from actual transactions.
Examples:
- average monthly grocery spending from the last three complete months,
- average fuel spending from the last three complete months,
- detected recurring subscription,
- detected salary pattern.
Derived assumptions are lower-trust than manual assumptions.
A derived assumption may be suggested to the user but must not override a manual assumption without explicit user action.
### 3.4 Scenario overrides
Scenario overrides are temporary changes used for comparison.
Examples:
- reduce ETF contribution from 300.00 € to 100.00 €,
- withdraw 500.00 € from Notgroschen,
- reduce variable spending by 15%,
- add one-time laptop purchase of 1,400.00 €,
- add one-time reimbursement of 250.00 €,
- change goal priority.
Scenario overrides apply only to the scenario forecast.
They must never mutate the base case.
### 3.5 Current balance source
The current balance is the starting liquidity value for the forecast.
Accepted sources:
1. user-entered current balance,
2. imported CSV balance if available and reliable,
3. calculated balance from prior transactions if account opening balance is known.
If the current balance is missing, Flowcast may calculate monthly trends but must not produce an absolute liquidity forecast.
### 3.6 Planned future payments
Planned future payments are user-entered future obligations or expected payments.
Examples:
- rent,
- insurance,
- subscription,
- yearly bill,
- one-time repair,
- expected reimbursement,
- expected bonus.
Planned future payments are used in the forecast timeline on their exact due dates.
### 3.7 Conflict resolution
When values conflict, this priority order applies:
1. scenario override, for the active scenario only,
2. imported actual transaction, for historical actuals,
3. manual assumption, for future behavior,
4. planned future payment, for dated future events,
5. derived assumption,
6. default fallback.
Important distinction:
- Historical periods are controlled by imported actual transactions.
- Future periods are controlled by manual assumptions, planned payments, and derived assumptions.
- Scenarios temporarily override base-case values but do not replace them.
Example:
If the user manually sets Apple Music to 10.99 € monthly, but Flowcast derives 5.99 € from older transactions, the manual value wins for future forecasts.
---
## 4. Canonical Terms and Formulas
All formulas use monthly values unless stated otherwise.
### 4.1 Income
Income is money entering the account that increases spending capacity.
Examples:
- salary,
- recurring wage,
- freelance income,
- expected reimbursement if marked as income,
- bonus if planned.
Formula:
```text
Income = Sum(all income transactions or planned income events in period)
```

Excluded from income:

* internal transfers,
* refund offsets,
* ETF sell transactions unless explicitly modeled,
* Notgroschen withdrawals unless explicitly modeled as scenario liquidity.

4.2 Fixed planned payments

Fixed planned payments are known recurring or one-time obligations.

Examples:

* rent,
* internet,
* GEZ,
* insurance,
* subscriptions,
* yearly bills,
* quarterly fees,
* loan payments.

Formula:

Fixed Planned Payments = Sum(all fixed planned outgoing payments in period)

For monthly equivalent views:

Monthly Equivalent = Payment Amount / Number of Months Covered

Examples:

Yearly payment monthly equivalent = Amount / 12
Quarterly payment monthly equivalent = Amount / 3

4.3 Variable spending

Variable spending is regular but non-fixed discretionary or semi-discretionary spending.

Examples:

* groceries,
* fuel,
* restaurants,
* shopping,
* pharmacy,
* hobbies,
* Amazon purchases,
* cash withdrawals unless categorized otherwise.

Formula:

Variable Spending = Sum(included variable spending transactions in baseline period) / Number of baseline months

Default baseline period:

Last 3 complete calendar months

4.4 Gross free cash flow

Gross free cash flow is the remaining monthly cash after fixed planned payments and variable spending, before protected savings.

Formula:

Gross Free Cash Flow = Income - Fixed Planned Payments - Variable Spending

This is not automatically safe-to-spend money because protected savings still need to be deducted.

4.5 Protected free cash flow

Protected free cash flow is the amount available after fixed payments, variable spending, ETF contribution, and Notgroschen contribution.

Formula:

Protected Free Cash Flow =
Income
- Fixed Planned Payments
- Variable Spending
- ETF Contribution
- Notgroschen Contribution

This is the primary amount available for lifestyle goals.

4.6 Scenario free cash flow

Scenario free cash flow is protected free cash flow after applying scenario overrides.

Formula:

Scenario Free Cash Flow =
Scenario Income
- Scenario Fixed Planned Payments
- Scenario Variable Spending
- Scenario ETF Contribution
- Scenario Notgroschen Contribution
- Scenario One-Off Expenses Monthly Impact
+ Scenario One-Off Income Monthly Impact

For timeline forecasts, one-off values are applied on exact dates, not spread monthly.

4.7 Emergency fund target

The emergency fund target is the desired Notgroschen amount.

Formula:

Emergency Fund Target = Essential Monthly Expenses * Target Months

Default target months:

3 months

The user may change the target months.

4.8 Essential monthly expenses

Essential monthly expenses are expenses required to maintain basic financial stability.

Default included categories:

* rent,
* utilities,
* internet,
* GEZ,
* insurance,
* groceries,
* transport/fuel required for work or essential mobility,
* minimum debt payments,
* required medical payments.

Default excluded categories:

* ETF contribution,
* vacation savings,
* laptop goal,
* restaurants,
* entertainment,
* shopping,
* subscriptions that are not essential.

Formula:

Essential Monthly Expenses =
Essential Fixed Planned Payments
+ Essential Variable Spending

4.9 Goal allocation amount

Goal allocation amount is the amount assigned to a lifestyle goal in a forecast period.

Formula:

Goal Allocation Amount = Min(Available Protected Free Cash Flow, Remaining Goal Amount)

When multiple goals exist, allocation follows priority order.

4.10 Remaining goal amount

Remaining goal amount is the amount still needed to complete a goal.

Formula:

Remaining Goal Amount = Goal Target Amount - Current Saved Amount

The value must not go below zero.

Remaining Goal Amount = Max(0, Goal Target Amount - Current Saved Amount)

4.11 Lowest projected balance

Lowest projected balance is the minimum account balance reached in the forecast timeline.

Formula:

Lowest Projected Balance = Min(Projected Daily Balance over Forecast Horizon)

4.12 Liquidity risk

Liquidity risk indicates whether projected balance falls below a threshold.

Default threshold:

0.00 €

Optional user-defined threshold:

Minimum Comfort Balance

Formula:

Liquidity Risk = Projected Balance < Risk Threshold

4.13 ETF contribution loss

ETF contribution loss measures how much ETF saving is reduced in a scenario compared with the base case.

Formula:

ETF Contribution Loss =
Base Case ETF Contributions over Period
- Scenario ETF Contributions over Period

Example:

Base ETF = 300.00 € monthly for 6 months = 1,800.00 €
Scenario ETF = 100.00 € monthly for 6 months = 600.00 €
ETF Contribution Loss = 1,200.00 €

4.14 Emergency fund recovery date

Emergency fund recovery date is the date when the Notgroschen reaches its target again after a withdrawal or shortfall.

Formula:

Emergency Fund Recovery Date =
First forecast date where Notgroschen Balance >= Emergency Fund Target

If the target is not reached within the forecast horizon:

Emergency Fund Recovery Date = Not reached within horizon

⸻

5. Transaction Treatment Rules

5.1 Salary

Salary is income.

A transaction is treated as salary when:

* it is categorized as salary by the user, or
* it matches a trusted recurring income pattern, or
* it matches employer-specific detection rules confirmed by the user.

Salary increases income and account balance.

5.2 Duplicate salary

Duplicate salary means two salary-like transactions appear in the same expected salary period.

Required behavior:

* Do not automatically assume both are recurring income.
* Mark as possible duplicate or special income.
* Include both in historical actual balance.
* Use only the expected recurring salary amount for future monthly income unless the user confirms otherwise.

Example:

If salary of 3,000.00 € appears twice in May, historical May income is 6,000.00 €, but future monthly salary remains 3,000.00 € unless confirmed.

5.3 Rent

Rent is a fixed planned payment.

It should be treated as essential.

If rent is detected historically and also entered manually as a planned payment, the manual planned value controls future forecasts.

Historical rent transactions remain actuals.

5.4 Subscriptions

Subscriptions are recurring fixed planned payments.

Examples:

* ChatGPT,
* Apple Music,
* Netflix,
* iCloud+,
* Disney+,
* Amazon Prime.

Monthly subscriptions are applied monthly on their planned date.

Yearly subscriptions are applied on the exact yearly date in the forecast timeline and may also be shown as monthly equivalent in summary views.

5.5 Yearly and quarterly bills

Yearly and quarterly bills are fixed planned payments.

Timeline behavior:

* apply full amount on exact due date.

Summary behavior:

* show monthly equivalent separately.

Example:

A yearly 120.00 € bill due on 2026-11-15:

Timeline impact on 2026-11-15 = -120.00 €
Monthly equivalent = 10.00 €

5.6 Internal transfers

Internal transfers move money between the user’s own accounts.

Default behavior:

* exclude from income,
* exclude from spending,
* include in account-specific balance movement if the forecast tracks only one account,
* avoid double-counting if both accounts are imported.

Examples:

* C24 main account to C24 pocket,
* account to savings pocket,
* account to credit card settlement account.

5.7 ETF transfers

ETF transfers are protected savings contributions by default.

Default behavior:

* exclude from variable spending,
* include as ETF contribution,
* reduce protected free cash flow,
* reduce account liquidity on the transfer date,
* do not count as lifestyle spending.

ETF transfers must not be automatically used for goals.

5.8 Notgroschen transfers

Notgroschen transfers are protected savings contributions by default.

Default behavior:

* exclude from variable spending,
* include as Notgroschen contribution,
* reduce protected free cash flow,
* reduce account liquidity on the transfer date,
* increase Notgroschen balance if the bucket is tracked.

Notgroschen transfers must not be automatically used for goals.

5.9 Credit card payments

Credit card payments are liability settlement transfers if individual card transactions are imported.

Default behavior when individual credit card transactions are imported:

* exclude credit card payment from spending,
* use individual card transactions for category spending.

Default behavior when individual credit card transactions are not imported:

* treat credit card payment as spending,
* categorize as credit card spending or unknown variable spending.

Flowcast must avoid double-counting.

5.10 Refunds

Refunds reduce spending in the original category where possible.

Default behavior:

Category Net Spending = Category Spending - Category Refunds

If the original category is unknown:

* categorize refund as uncategorized refund,
* exclude from income,
* show as spending offset.

Refunds must not inflate income.

5.11 Cash withdrawals

Cash withdrawals are treated as variable spending by default.

Default category:

Cash / ATM

The user may split or recategorize cash withdrawals manually.

Cash withdrawals are included in variable spending baseline unless excluded.

5.12 One-off purchases

One-off purchases are included in historical actuals.

For baseline calculation:

* include if they represent normal lifestyle spending,
* exclude if marked as exceptional.

Example:

A 1,400.00 € laptop purchase should usually be excluded from recurring variable spending baseline and modeled as a goal or one-off expense.

5.13 Reimbursements

Reimbursements are treated as offsets if they repay prior spending.

Examples:

* friend pays back dinner,
* employer reimburses travel,
* returned deposit.

Default behavior:

* exclude from income,
* offset the related category if linked,
* otherwise classify as reimbursement.

If the reimbursement is recurring and salary-like, the user may classify it as income.

5.14 Pending transactions

Pending transactions are not final actuals.

Default behavior:

* include in near-term liquidity preview,
* mark as pending,
* do not use for historical baseline until finalized,
* replace or reconcile when finalized transaction appears.

Pending transactions must not create permanent duplicates.

5.15 Excluded transactions

Excluded transactions are ignored for calculation purposes selected by the user.

Possible exclusion scopes:

* exclude from variable baseline,
* exclude from income detection,
* exclude from forecast,
* exclude from all analytics.

Excluded transactions must remain visible in audit views.

⸻

6. Variable Spending Baseline Rules

6.1 Last three complete calendar months

The default variable spending baseline uses the last three complete calendar months before the current month.

Example:

If today is 2026-05-14, the baseline months are:

February 2026
March 2026
April 2026

May 2026 is excluded because it is partial.

6.2 Why partial current month is excluded

The current month is excluded because it is incomplete.

Including it would usually understate spending early in the month and distort the monthly baseline.

Example:

On May 14, grocery spending may look low because half the month has not happened yet.

6.3 Included transactions

Included by default:

* groceries,
* restaurants,
* fuel,
* pharmacy,
* shopping,
* Amazon purchases,
* entertainment,
* cash withdrawals,
* other normal variable spending.

6.4 Excluded transactions

Excluded by default:

* salary,
* rent,
* subscriptions already modeled as fixed payments,
* yearly bills already modeled as planned payments,
* quarterly bills already modeled as planned payments,
* internal transfers,
* ETF transfers,
* Notgroschen transfers,
* credit card settlement payments if individual card transactions are imported,
* refunds as standalone income,
* reimbursements as standalone income,
* excluded transactions,
* exceptional one-off purchases marked by the user.

6.5 Refund behavior

Refunds reduce the category spending of the category they belong to.

Formula:

Net Category Spending = Gross Category Spending - Category Refunds

The net value may not go below zero unless the user explicitly allows negative category spending.

Default:

Net Category Spending = Max(0, Gross Category Spending - Category Refunds)

6.6 Manual overrides

The user may manually override:

* total monthly variable spending,
* category-level spending,
* inclusion or exclusion of specific transactions,
* baseline period.

Manual overrides win over derived assumptions.

The app must show that the value is manually overridden.

6.7 Reverting to automatic

The user may revert a manual override to automatic.

Required behavior:

* remove the manual override,
* recalculate the value from the current baseline rules,
* preserve transaction categorizations,
* preserve exclusion flags unless explicitly reset.

6.8 Fewer than three complete months

If fewer than three complete months exist, Flowcast must use the best available complete months and mark confidence as lower.

Rules:

* 2 complete months: use 2-month average and show low-confidence warning.
* 1 complete month: use 1-month value and show low-confidence warning.
* 0 complete months: require manual assumption or use category defaults only if explicitly accepted by the user.

Flowcast must not pretend that a one-month baseline has the same reliability as a three-month baseline.

⸻

7. Planned Payment Rules

7.1 Monthly payments

Monthly payments occur once per month on the configured day.

Example:

Rent: 780.00 € on day 1 of every month

If the configured day does not exist in a month, use the last day of that month.

Example:

Payment day 31 in February becomes February 28 or February 29.

7.2 Quarterly payments

Quarterly payments occur every three months.

Required fields:

* amount,
* start date or next due date,
* recurrence interval,
* category,
* essential flag.

Example:

Trainerpauschale: 4.98 € every 3 months
Monthly equivalent: 1.66 €

7.3 Yearly payments

Yearly payments occur once per year on the configured date.

Example:

Car insurance: 822.12 € every year on 2026-11-15
Monthly equivalent: 68.51 €

Leap-day behavior:

* If a yearly payment is scheduled for February 29, use February 28 in non-leap years unless user chooses March 1.

7.4 One-time payments

One-time payments occur once on the exact configured date.

Examples:

* laptop purchase,
* car repair,
* vacation payment,
* tax refund,
* bonus.

One-time payments must not automatically become recurring.

7.5 Exact-date handling

Forecast timeline calculations must apply planned payments on their exact due dates.

Summary views may show monthly equivalents, but the liquidity forecast must use actual dates.

This distinction is critical.

A yearly 1,200.00 € bill is not the same liquidity risk as a 100.00 € monthly bill.

7.6 Monthly equivalent calculation

Formula:

Monthly Equivalent = Amount / Interval Months

Examples:

Monthly payment: Amount / 1
Quarterly payment: Amount / 3
Yearly payment: Amount / 12

Monthly equivalents are used for summaries, not daily cash-flow placement.

7.7 Interaction with imported historical transactions

Historical imported transactions remain actuals.

Future planned payments start from the forecast start date.

If a planned payment matches an imported historical transaction, Flowcast may use the actual historical amount to suggest a planned payment, but must not duplicate it in the same historical period.

⸻

8. Savings Bucket Rules

8.1 ETF bucket

The ETF bucket represents long-term investing.

Default behavior:

* protected,
* high priority,
* not available for lifestyle goals,
* tracked by monthly contribution,
* scenario-adjustable only by explicit user action.

ETF contributions reduce current account liquidity on the transfer date.

8.2 Notgroschen bucket

The Notgroschen bucket represents emergency savings.

Default behavior:

* protected,
* highest practical liquidity priority,
* not available for lifestyle goals,
* tracked by current amount and target amount,
* scenario withdrawal allowed only if explicitly modeled.

8.3 Protected behavior

Protected savings are deducted before calculating lifestyle affordability.

Formula:

Protected Savings = ETF Contribution + Notgroschen Contribution
Protected Free Cash Flow =
Gross Free Cash Flow - Protected Savings

8.4 Priority

Default priority order:

1. essential fixed payments,
2. essential variable spending,
3. Notgroschen contribution until target is reached,
4. ETF contribution,
5. lifestyle goals,
6. discretionary surplus.

The user may change priority order in scenarios, but the base case should protect ETF and Notgroschen by default.

8.5 Monthly contribution

Each savings bucket has a monthly contribution amount.

Required fields:

* bucket type,
* monthly amount,
* transfer day,
* current amount,
* target amount if applicable,
* protected flag.

8.6 Current amount

The current amount is the known balance of the bucket.

Examples:

Notgroschen current amount = 2,000.00 €
ETF current amount = 8,500.00 €

If unknown, Flowcast may still forecast contributions but must not show full bucket balance.

8.7 Target amount

ETF target amount is optional.

Notgroschen target amount is recommended.

Formula:

Notgroschen Target = Essential Monthly Expenses * Target Months

8.8 Scenario withdrawal rules

A scenario may model a one-time Notgroschen withdrawal.

Required behavior:

* decrease Notgroschen balance on withdrawal date,
* increase available liquidity if withdrawal moves money into main account,
* calculate emergency fund gap,
* calculate emergency fund recovery date,
* report downside explicitly.

Example downside:

This scenario funds the laptop by withdrawing 500.00 € from Notgroschen.
Emergency fund falls from 2,000.00 € to 1,500.00 €.
Recovery date: 2026-09-01.

8.9 What must never happen automatically

Flowcast must never automatically:

* use ETF contributions for lifestyle goals,
* withdraw from Notgroschen for lifestyle goals,
* pause ETF contributions,
* pause Notgroschen contributions,
* reduce emergency fund target,
* convert protected savings into disposable cash,
* hide ETF contribution loss,
* hide emergency fund recovery delay.

⸻

9. Goal Planning Rules

9.1 Goal target amount

Goal target amount is the total amount needed for a goal.

Example:

Vacation target amount = 2,000.00 €

9.2 Current saved amount

Current saved amount is the amount already assigned to the goal.

Example:

Vacation current saved amount = 600.00 €

9.3 Remaining goal amount

Formula:

Remaining Goal Amount = Max(0, Target Amount - Current Saved Amount)

Example:

2,000.00 € - 600.00 € = 1,400.00 €

9.4 Priority order

Goals are funded by priority order.

Default behavior:

* highest-priority goal receives available protected free cash flow first,
* next goal receives remaining available cash flow,
* continue until no available protected free cash flow remains.

9.5 Month-by-month allocation

For each forecast month:

Available Goal Funding = Max(0, Protected Free Cash Flow)

Allocation:

Goal Allocation = Min(Available Goal Funding, Remaining Goal Amount)

When a goal is completed, later months allocate to the next goal.

9.6 Protected free cash flow is zero or negative

If protected free cash flow is zero:

* no lifestyle goal funding is available,
* goal date may be delayed,
* do not use protected savings automatically.

If protected free cash flow is negative:

* show negative protected free cash flow warning,
* no lifestyle goal funding is available,
* indicate monthly shortfall,
* do not suggest lifestyle spending as affordable.

9.7 Multiple goals competing

When multiple goals compete:

* allocate by priority,
* show which goal is delayed,
* show funding amount per goal per month,
* show completion date per goal,
* show trade-off if priority changes.

Example:

If vacation has priority 1 and laptop has priority 2, vacation receives funding first.

9.8 Target date impossible

A goal target date is impossible if the remaining amount cannot be funded by the target date using available protected free cash flow.

Formula:

Required Monthly Goal Funding =
Remaining Goal Amount / Months Until Target Date

If:

Required Monthly Goal Funding > Available Protected Free Cash Flow

then the target date is unreachable in the base case.

Required output:

* mark goal as unreachable by target date,
* show required monthly amount,
* show available monthly amount,
* show earliest estimated completion date,
* show scenario options without automatically changing protected savings.

⸻

10. Scenario Rules

10.1 ETF contribution override

A scenario may reduce, pause, or increase ETF contribution.

Required reporting:

* new ETF contribution,
* base ETF contribution,
* ETF contribution loss over horizon,
* increased goal funding capacity,
* effect on lowest projected balance.

Example:

Base ETF: 300.00 €/month
Scenario ETF: 100.00 €/month
ETF contribution loss over 6 months: 1,200.00 €

10.2 Notgroschen contribution override

A scenario may reduce, pause, or increase Notgroschen contribution.

Required reporting:

* new Notgroschen contribution,
* base Notgroschen contribution,
* emergency fund target impact,
* recovery delay if target is not reached.

10.3 One-time Notgroschen withdrawal

A scenario may include a one-time withdrawal from Notgroschen.

Required reporting:

* withdrawal amount,
* withdrawal date,
* emergency fund balance after withdrawal,
* emergency fund gap,
* recovery date,
* liquidity improvement.

10.4 Variable spending multiplier

A scenario may adjust variable spending by multiplier.

Examples:

Reduce variable spending by 10%: multiplier = 0.90
Increase variable spending by 15%: multiplier = 1.15

Formula:

Scenario Variable Spending = Base Variable Spending * Multiplier

10.5 One-off expense

A scenario may add a one-time expense.

Examples:

* laptop,
* vacation booking,
* car repair.

The one-off expense must be placed on its exact scenario date.

10.6 One-off income

A scenario may add one-time income.

Examples:

* tax refund,
* bonus,
* reimbursement,
* sold item.

The one-off income must be placed on its exact scenario date.

10.7 Goal priority change

A scenario may reorder goals.

Required behavior:

* recalculate goal funding month by month,
* show changed completion dates,
* show which goals benefit and which goals are delayed.

10.8 Base case vs scenario comparison

Every scenario must be compared against the base case.

Minimum comparison fields:

* protected free cash flow,
* lowest projected balance,
* date of lowest projected balance,
* goal completion date,
* ETF contribution loss,
* emergency fund gap,
* emergency fund recovery date,
* months below threshold.

10.9 Required downside reporting

A scenario must explicitly report downsides.

Examples:

* reduced ETF contribution,
* delayed emergency fund recovery,
* lower lowest projected balance,
* increased liquidity risk,
* delayed second goal,
* negative protected free cash flow.

Flowcast must not present a scenario as simply “affordable” if it relies on weakening protected savings.

⸻

11. Forecast Timeline Rules

11.1 Forecast start date

The forecast starts from the current date.

Default:

Forecast Start Date = Today

If current balance is dated, the forecast starts from the balance date.

11.2 Forecast horizon

Supported forecast horizons:

* 90 days,
* 6 months,
* 12 months.

Default MVP horizon:

90 days

11.3 Daily forecast points

Forecasts are calculated as daily points.

Formula:

Projected Balance on Day N =
Projected Balance on Day N-1
+ Income Events on Day N
- Planned Payment Events on Day N
- Variable Spending Allocation on Day N
- Savings Contribution Events on Day N
- Goal Allocation Events on Day N
+ Scenario Income Events on Day N
- Scenario Expense Events on Day N

11.4 Income event placement

Income is placed on expected payment dates.

Example:

Salary: +3,000.00 € on the 28th of each month

If salary date falls on a weekend or holiday, MVP may use the configured date.

Future enhancement may support banking-day adjustment.

11.5 Planned payment event placement

Planned payments are placed on exact due dates.

Examples:

Rent: -780.00 € on day 1
Insurance: -822.12 € on 2026-11-15
Netflix: -4.99 € on day 12

11.6 Variable spending daily allocation

Variable spending is allocated daily by default.

Formula:

Daily Variable Spending = Monthly Variable Spending / Days in Month

Category-level daily allocation may be used if category timing is known.

MVP default:

* smooth daily allocation.

Important:

Fixed planned payments must not be smoothed. Only variable spending may be smoothed.

11.7 Savings contribution event placement

Savings contributions are placed on configured transfer dates.

Examples:

ETF contribution: -300.00 € on day 2
Notgroschen contribution: -150.00 € on day 2

Savings contributions are not smoothed unless the user configures them that way.

11.8 Goal allocation event placement

Goal allocation is placed on the configured goal funding date.

Default:

Goal allocation date = day after salary

If not configured, use the first day after all protected savings contributions for that month have been applied.

Goal allocation must not cause projected balance to fall below the configured minimum safety threshold unless explicitly allowed by the user.

11.9 Optimistic, expected, and conservative forecast lines

Flowcast supports three forecast lines.

Expected

Uses base assumptions exactly.

Expected Variable Spending = Baseline Variable Spending

Optimistic

Assumes lower variable spending.

Default:

Optimistic Variable Spending = Baseline Variable Spending * 0.85

Conservative

Assumes higher variable spending.

Default:

Conservative Variable Spending = Baseline Variable Spending * 1.15

Protected savings remain protected in all three lines unless a scenario explicitly changes them.

⸻

12. Risk Metrics

12.1 Lowest projected balance

The minimum projected account balance over the selected forecast horizon.

Formula:

Lowest Projected Balance = Min(Projected Daily Balance)

12.2 Date of lowest projected balance

The first date on which the lowest projected balance occurs.

Formula:

Date of Lowest Projected Balance =
First date where Projected Balance = Lowest Projected Balance

12.3 Months below threshold

Counts months where projected balance falls below the user-defined threshold at least once.

Default threshold:

0.00 €

Formula:

Months Below Threshold =
Count(months where Min(Projected Daily Balance in Month) < Threshold)

12.4 Liquidity risk weeks

Counts calendar weeks where projected balance falls below the threshold at least once.

Formula:

Liquidity Risk Weeks =
Count(weeks where Min(Projected Daily Balance in Week) < Threshold)

12.5 Emergency fund gap

Emergency fund gap is the missing amount between target and current Notgroschen balance.

Formula:

Emergency Fund Gap = Max(0, Emergency Fund Target - Notgroschen Current Amount)

12.6 Emergency fund recovery date

The first date when Notgroschen reaches target again.

Formula:

Emergency Fund Recovery Date =
First date where Notgroschen Projected Balance >= Emergency Fund Target

If not reached:

Emergency Fund Recovery Date = Not reached within selected horizon

12.7 Negative protected free cash flow

Negative protected free cash flow means the user cannot maintain current income, fixed payments, variable spending, ETF contribution, and Notgroschen contribution simultaneously.

Formula:

Protected Free Cash Flow < 0

Required output:

* monthly shortfall,
* affected months,
* lowest projected balance,
* suggested scenario levers,
* no automatic use of protected savings.

12.8 Goal unreachable state

A goal is unreachable by target date if available protected free cash flow cannot cover the remaining amount in time.

Formula:

Required Monthly Funding > Available Protected Free Cash Flow

Required output:

* unreachable status,
* required monthly funding,
* available monthly funding,
* earliest completion date,
* trade-off scenarios.

⸻

13. Worked Examples

13.1 Normal monthly forecast

Inputs:

Current balance: 1,500.00 €
Monthly salary: 3,000.00 €
Rent: 780.00 €
Internet: 47.00 €
GEZ: 18.00 €
Insurance: 75.00 €
Subscriptions: 45.00 €
Variable spending baseline: 850.00 €
ETF contribution: 300.00 €
Notgroschen contribution: 150.00 €

Gross free cash flow:

Gross Free Cash Flow =
3,000.00 €
- 780.00 €
- 47.00 €
- 18.00 €
- 75.00 €
- 45.00 €
- 850.00 €
= 1,185.00 €

Protected free cash flow:

Protected Free Cash Flow =
1,185.00 €
- 300.00 €
- 150.00 €
= 735.00 €

Result:

Monthly lifestyle goal capacity = 735.00 €
ETF and Notgroschen remain protected.

13.2 Goal affordability without touching protected savings

Inputs:

Laptop goal target: 1,400.00 €
Current saved for goal: 200.00 €
Remaining goal amount: 1,200.00 €
Protected free cash flow: 735.00 €/month

Required months:

1,200.00 € / 735.00 € = 1.63 months

Result:

Goal can be funded in 2 months without touching ETF or Notgroschen.

Month-by-month:

Month 1 allocation: 735.00 €
Remaining after month 1: 465.00 €
Month 2 allocation: 465.00 €
Remaining after month 2: 0.00 €
Goal complete.

13.3 Goal affordability with reduced ETF contribution

Base case:

ETF contribution: 300.00 €/month
Protected free cash flow: 735.00 €/month
Laptop remaining amount: 1,200.00 €

Scenario:

ETF contribution reduced to 100.00 €/month
Additional available cash flow: 200.00 €/month
Scenario protected free cash flow: 935.00 €/month

Required months:

1,200.00 € / 935.00 € = 1.28 months

Result:

Goal can be funded in 2 months.

Downside:

ETF contribution loss over 2 months =
(300.00 € - 100.00 €) * 2
= 400.00 €

Required reporting:

This scenario improves short-term affordability but reduces ETF contributions by 400.00 € over the goal funding period.

13.4 Goal affordability with Notgroschen withdrawal

Inputs:

Laptop remaining amount: 1,200.00 €
Protected free cash flow: 735.00 €/month
Notgroschen current amount: 3,000.00 €
Emergency fund target: 3,600.00 €
Scenario withdrawal: 500.00 €
Notgroschen monthly contribution: 150.00 €

After withdrawal:

Notgroschen balance = 3,000.00 € - 500.00 € = 2,500.00 €
Emergency fund gap = 3,600.00 € - 2,500.00 € = 1,100.00 €

Goal funding need after withdrawal:

1,200.00 € - 500.00 € = 700.00 €

Goal completion:

700.00 € / 735.00 € = 0.95 months

Result:

Goal can be funded in 1 month.

Emergency fund recovery:

1,100.00 € / 150.00 € = 7.34 months

Result:

Emergency fund recovery takes 8 months.

Required downside reporting:

This scenario uses emergency savings. The Notgroschen falls 1,100.00 € below target and recovers after 8 months.

13.5 Variable spending baseline using last three complete months

Today:

2026-05-14

Use complete months:

February 2026
March 2026
April 2026

Transactions:

February variable spending: 820.00 €
March variable spending: 910.00 €
April variable spending: 870.00 €

Baseline:

(820.00 € + 910.00 € + 870.00 €) / 3
= 866.67 €

Result:

Variable spending baseline = 866.67 €/month

May is excluded because it is incomplete.

13.6 Refund reducing category spending

Transactions:

Amazon purchase: -120.00 €
Amazon refund: +40.00 €

Category:

Shopping

Net category spending:

120.00 € - 40.00 € = 80.00 €

Result:

Shopping spending = 80.00 €
Refund is not counted as income.

13.7 Negative protected free cash flow

Inputs:

Income: 2,500.00 €
Fixed planned payments: 1,050.00 €
Variable spending: 950.00 €
ETF contribution: 400.00 €
Notgroschen contribution: 200.00 €

Protected free cash flow:

2,500.00 €
- 1,050.00 €
- 950.00 €
- 400.00 €
- 200.00 €
= -100.00 €

Result:

Protected free cash flow is -100.00 €/month.

Required behavior:

No lifestyle goal funding is available.
Flowcast must warn that current assumptions are not sustainable.
Flowcast must not automatically reduce ETF or Notgroschen.

13.8 Multiple goals funded by priority

Inputs:

Protected free cash flow: 500.00 €/month
Goal 1: Vacation
Target: 1,200.00 €
Current saved: 200.00 €
Remaining: 1,000.00 €
Priority: 1
Goal 2: Laptop
Target: 1,400.00 €
Current saved: 400.00 €
Remaining: 1,000.00 €
Priority: 2

Month-by-month allocation:

Month 1:
Vacation receives 500.00 €
Vacation remaining: 500.00 €
Laptop receives 0.00 €
Month 2:
Vacation receives 500.00 €
Vacation remaining: 0.00 €
Laptop receives 0.00 €
Month 3:
Laptop receives 500.00 €
Laptop remaining: 500.00 €
Month 4:
Laptop receives 500.00 €
Laptop remaining: 0.00 €

Result:

Vacation completes after 2 months.
Laptop completes after 4 months.

⸻

14. Edge Case Table

Edge case	Required behavior	Reason
Duplicate CSV upload	Detect duplicate transactions by stable transaction identity or matching fingerprint. Do not double-count.	Prevent inflated income or spending.
Partial current month	Exclude from default variable spending baseline.	Partial months understate spending.
Salary paid twice	Include both in historical actuals, but do not assume future salary doubled unless confirmed.	Avoid unrealistic future income forecast.
Internal ETF transfer	Treat as protected ETF contribution, not variable spending.	ETF saving is not lifestyle consumption.
Internal Notgroschen transfer	Treat as protected emergency fund contribution, not variable spending.	Emergency savings must remain protected.
Refund	Offset original category spending where possible. Do not count as income.	Refunds reduce spending; they are not new earning power.
Cash withdrawal	Treat as variable spending by default under Cash / ATM. Allow manual split or recategorization.	Cash use reduces liquidity and usually represents spending.
Amazon purchase	Treat as variable shopping by default unless categorized as one-off or excluded.	Amazon can be normal spending or exceptional purchase.
One-time laptop purchase	Treat as one-off expense or goal, not recurring baseline spending.	Large one-off purchases distort recurring baseline.
Negative protected free cash flow	Show warning, block automatic lifestyle goal funding, and report monthly shortfall.	User cannot safely fund goals under current assumptions.
Emergency fund withdrawal scenario	Allow only as explicit scenario. Report emergency fund gap and recovery date.	Notgroschen is protected by default.
Missing current balance	Do not produce absolute daily balance forecast. Show relative cash-flow forecast only.	Absolute liquidity requires a starting balance.
Fewer than three months of data	Use available complete months with low-confidence warning, or require manual assumption.	Thin data creates unreliable baseline.
Goal target date impossible	Mark as unreachable, show required vs available monthly funding, and estimate earliest completion date.	Product must explain affordability limits.

⸻

15. Test Fixture Requirements

Backend test fixtures must cover deterministic calculation behavior.

Each fixture should include:

* input transactions,
* current balance,
* planned payments,
* savings bucket settings,
* goals,
* scenario overrides if applicable,
* expected monthly summary,
* expected daily forecast points where relevant,
* expected risk metrics,
* expected explanation fields.

15.1 Fixture: normal_monthly_forecast

Purpose:

Verify standard monthly cash-flow calculation.

Inputs:

Income: 3,000.00 €
Fixed planned payments: 965.00 €
Variable spending: 850.00 €
ETF contribution: 300.00 €
Notgroschen contribution: 150.00 €

Expected output:

Gross free cash flow: 1,185.00 €
Protected free cash flow: 735.00 €
Negative protected free cash flow: false

15.2 Fixture: duplicate_csv_upload

Purpose:

Verify duplicate imported transactions are not double-counted.

Inputs:

Same CSV imported twice.
Transaction A appears twice with same date, amount, counterparty, reference.

Expected output:

Transaction counted once.
Duplicate marked.
Spending and income unchanged after second import.

15.3 Fixture: salary_paid_twice

Purpose:

Verify duplicate salary treatment.

Inputs:

Salary +3,000.00 € on 2026-04-28
Salary +3,000.00 € on 2026-04-29

Expected output:

Historical April income: 6,000.00 €
Future monthly salary assumption: 3,000.00 €
Duplicate salary warning: true

15.4 Fixture: last_three_complete_months_baseline

Purpose:

Verify baseline excludes partial current month.

Inputs:

Today: 2026-05-14
February variable spending: 820.00 €
March variable spending: 910.00 €
April variable spending: 870.00 €
May spending to date: 300.00 €

Expected output:

Baseline months: February, March, April
Variable spending baseline: 866.67 €
May excluded: true

15.5 Fixture: refund_reduces_category_spending

Purpose:

Verify refund offsets spending.

Inputs:

Shopping purchase: -120.00 €
Shopping refund: +40.00 €

Expected output:

Shopping net spending: 80.00 €
Refund counted as income: false

15.6 Fixture: etf_transfer_protected

Purpose:

Verify ETF transfer is not variable spending.

Inputs:

ETF transfer: -300.00 €

Expected output:

Variable spending impact: 0.00 €
ETF contribution: 300.00 €
Protected savings: includes 300.00 €

15.7 Fixture: notgroschen_transfer_protected

Purpose:

Verify Notgroschen transfer is protected.

Inputs:

Notgroschen transfer: -150.00 €

Expected output:

Variable spending impact: 0.00 €
Notgroschen contribution: 150.00 €
Protected savings: includes 150.00 €

15.8 Fixture: negative_protected_free_cash_flow

Purpose:

Verify warning and blocked lifestyle goal funding.

Inputs:

Income: 2,500.00 €
Fixed planned payments: 1,050.00 €
Variable spending: 950.00 €
ETF contribution: 400.00 €
Notgroschen contribution: 200.00 €

Expected output:

Protected free cash flow: -100.00 €
Lifestyle goal funding available: 0.00 €
Negative protected free cash flow warning: true

15.9 Fixture: goal_affordable_without_protected_savings

Purpose:

Verify goal can be funded from protected free cash flow.

Inputs:

Goal remaining amount: 1,200.00 €
Protected free cash flow: 735.00 €/month

Expected output:

Completion months: 2
ETF contribution loss: 0.00 €
Emergency fund withdrawal: 0.00 €

15.10 Fixture: goal_with_reduced_etf_scenario

Purpose:

Verify ETF override and ETF contribution loss.

Inputs:

Base ETF: 300.00 €/month
Scenario ETF: 100.00 €/month
Scenario duration: 2 months

Expected output:

Additional monthly cash flow: 200.00 €
ETF contribution loss: 400.00 €
Scenario downside reported: true

15.11 Fixture: goal_with_notgroschen_withdrawal

Purpose:

Verify emergency fund withdrawal scenario.

Inputs:

Notgroschen current: 3,000.00 €
Emergency fund target: 3,600.00 €
Withdrawal: 500.00 €
Monthly Notgroschen contribution: 150.00 €

Expected output:

Notgroschen after withdrawal: 2,500.00 €
Emergency fund gap: 1,100.00 €
Recovery months: 8
Downside reported: true

15.12 Fixture: multiple_goals_priority

Purpose:

Verify priority-based goal allocation.

Inputs:

Protected free cash flow: 500.00 €/month
Goal 1 remaining: 1,000.00 €
Goal 2 remaining: 1,000.00 €

Expected output:

Goal 1 completion: month 2
Goal 2 completion: month 4
Goal 2 receives no funding before Goal 1 completes.

15.13 Fixture: missing_current_balance

Purpose:

Verify absolute forecast is blocked without current balance.

Inputs:

Current balance: missing
Income and spending assumptions available

Expected output:

Absolute daily balance forecast: unavailable
Relative monthly cash flow: available
Missing balance warning: true

15.14 Fixture: goal_target_date_impossible

Purpose:

Verify unreachable goal state.

Inputs:

Goal remaining amount: 2,000.00 €
Months until target date: 2
Protected free cash flow: 600.00 €/month

Expected output:

Required monthly funding: 1,000.00 €
Available monthly funding: 600.00 €
Goal reachable by target date: false
Earliest completion: month 4

⸻

16. Open Product Decisions

These decisions should not block the MVP, but must be resolved before selling the product.

16.1 Local-only vs hosted

Decision:

Should Flowcast run fully local-first, hosted, or hybrid?

Considerations:

* bank transaction privacy,
* sync across devices,
* backup,
* authentication,
* operating cost,
* trust positioning.

16.2 Multi-bank support

Decision:

Should MVP support only C24 CSV imports, or should the data model already support multiple banks?

Recommendation:

The MVP may import only C24, but the transaction model should not hardcode C24-specific assumptions into core calculations.

16.3 Credit card account support

Decision:

How should Flowcast handle credit card accounts?

Required before selling:

* avoid double-counting,
* distinguish card purchases from card settlement payments,
* support credit card due dates,
* support partial repayment.

16.4 Tax handling

Decision:

Should tax refunds, tax prepayments, and tax liabilities be modeled as special categories?

MVP may treat them as one-time income or expenses.

Before selling, tax-related labels must avoid tax advice.

16.5 AI categorization

Decision:

Should AI categorization be included, and if yes, how should confidence and user review work?

Required behavior if added:

* AI suggestions must be reviewable,
* low-confidence categories must be flagged,
* AI must not silently alter historical calculations without traceability.

16.6 Paid product privacy copy

Decision:

What privacy guarantees are communicated to paying users?

Must resolve:

* whether data leaves the device,
* whether transactions are used for model training,
* data retention policy,
* encryption,
* deletion process,
* export rights.

16.7 Backup and export format

Decision:

What backup and export format should Flowcast support?

Options:

* JSON export,
* CSV export,
* SQLite backup,
* encrypted local backup,
* cloud sync backup.

Minimum requirement before selling:

Users must be able to export their own financial data and assumptions in a documented format.
