# Flowcast Product Data Boundaries and Privacy Posture

## 1. Purpose

This document defines what Flowcast stores, where it stores it, what may leave
the user's machine, and what must never leave the user's machine in the MVP.

It is the product privacy source of truth for:

- storage decisions,
- import behavior,
- telemetry boundaries,
- future AI behavior,
- user-facing privacy copy,
- later paid-product privacy decisions.

This document describes product behavior. It is not legal advice.

## 2. MVP privacy position

Flowcast MVP is strictly local-first.

That means:

- no cloud account is required,
- no server is required for normal use,
- no sync is required,
- all primary finance data lives on the user's machine,
- the app must remain fully usable without any online service.

The only allowed exception in the MVP is optional AI use when the user has
explicitly enabled AI features.

## 3. Core privacy principles

### 3.1 Primary rule

Personal finance data belongs on the user's own device unless the user has
explicitly chosen otherwise for a specific optional feature.

### 3.2 Red line

Raw imported CSV files must never be sent to third parties, must never be stored
in a cloud service by default, and must never leave the user's machine as part
of telemetry, analytics, debugging, or AI features.

### 3.3 Personal data boundary

No personally identifiable transaction data may be stored anywhere except the
user's own PC or laptop in the MVP.

This includes, at minimum:

- raw imported CSV files,
- payee names,
- booking texts,
- purposes and references,
- balances,
- account identifiers,
- transaction history,
- manually entered financial assumptions,
- goal names if they could reveal personal circumstances,
- free-text notes that may contain personal details.

### 3.4 Explainable exceptions only

If any optional external feature exists later, the app must state clearly:

- what data is sent,
- why it is sent,
- where it is sent,
- when it is sent,
- how the user can disable it.

## 4. What Flowcast stores locally in the MVP

Flowcast may store the following data locally on disk:

- imported raw C24 CSV files,
- parsed transaction data,
- import metadata,
- category assignments,
- exclusion flags,
- merchant rules,
- planned payments,
- derived spending assumptions,
- manual overrides,
- savings bucket settings,
- goal settings,
- scenario definitions,
- app settings,
- audit and reconciliation metadata,
- local log files needed for debugging.

Default MVP storage model:

- local SQLite database for product data,
- raw CSV import archive kept on local disk,
- optional encrypted backup later, not required in the MVP.

## 5. Raw CSV import policy

Imported bank CSV files are intentionally retained on local disk after import.

Why:

- auditability,
- re-import support,
- debugging parser issues,
- user trust and traceability.

Required behavior:

- the app must store raw CSV imports only on the local machine,
- the app must never upload them automatically,
- the app must show or document where they are stored,
- the app must allow the user to delete them locally later,
- telemetry and AI features must never attach raw CSV files.

## 6. Local database policy

The SQLite database is the primary working store in the MVP.

It may contain:

- normalized transactions,
- categories,
- rules,
- assumptions,
- goals,
- scenarios,
- import metadata,
- pointers to raw CSV files,
- application settings.

Required behavior:

- SQLite is local-only in the MVP,
- no automatic remote replication,
- no hidden background sync,
- no hidden backup upload,
- no requirement to create an account.

Optional later behavior:

- encrypted export,
- encrypted backup,
- manual restore,
- optional sync only if the user explicitly enables a future hosted product.

## 7. Data classification

### 7.1 High-sensitivity local-only data

These data types must remain local-only in the MVP and must never be sent to
third-party services:

- raw CSV files,
- transaction rows,
- payee and merchant names,
- booking text and payment purpose,
- account balances,
- historical spending by merchant,
- imported financial history,
- free-text notes,
- local database contents as a whole.

### 7.2 Sensitive derived finance data

These data types are still sensitive and should also remain local-only in the
MVP unless a future feature explicitly requires otherwise:

- category-level spending summaries,
- emergency fund target and current level,
- ETF contribution settings,
- protected free cash flow,
- goal amounts and target dates,
- scenario outcomes.

### 7.3 Low-sensitivity operational data

These data types may be used in telemetry if they contain no personal finance
content and no personally identifiable information:

- app version,
- OS version,
- crash timestamp,
- error class,
- module or feature area,
- anonymized stack trace,
- boolean feature flags,
- performance timings without business data payloads.

## 8. Telemetry policy

Crash and error telemetry is allowed in the MVP because the product needs
debuggability and reliability, but it must be tightly constrained.

### 8.1 Allowed telemetry purpose

Telemetry may be used only for:

- crash reporting,
- runtime error reporting,
- release health monitoring,
- debugging non-personal technical failures.

### 8.2 Telemetry must never include

Telemetry must never include:

- raw CSV files,
- transaction rows,
- payee names,
- booking texts,
- balances,
- IBANs or account identifiers,
- goal names if they contain personal meaning,
- user notes,
- full database dumps,
- screenshots of financial data,
- prompts or AI payloads containing personal finance data.

### 8.3 Allowed telemetry fields

Allowed telemetry fields should be limited to technical metadata such as:

- app version,
- platform and OS version,
- timestamp,
- error message after sanitization,
- stack trace after sanitization,
- affected module,
- non-sensitive feature flag state,
- locally generated anonymous installation identifier if needed.

### 8.4 Sanitization requirements

Before any telemetry event leaves the device, the app must strip or redact:

- names,
- free text,
- numeric balances,
- transaction descriptions,
- imported file contents,
- direct financial values tied to the user.

If sanitization is uncertain, the event must stay local and not be sent.

### 8.5 User expectation

The product must clearly state that crash/error telemetry exists for technical
debugging, while also clearly stating that personal finance data and imported
CSV contents are never sent through telemetry.

## 9. AI feature policy

AI is not part of the normal MVP path.

If AI is added later:

- it must be disabled by default,
- it may only be enabled by explicit user action,
- the user should not be asked for approval on every single use after enabling,
- the product must explain what categories of data are sent to the provider,
- raw CSV files must never be sent,
- personally identifiable financial data must not be sent unless a future design
  explicitly changes this policy and the user opts in knowingly.

### 9.1 MVP AI posture

Default MVP behavior:

- no AI calls,
- no AI account required,
- no AI configuration required,
- no silent background sending of finance data.

### 9.2 If optional AI is enabled later

Permitted design direction:

- one explicit enablement step,
- clear provider disclosure,
- clear statement that external processing is occurring,
- ability to disable AI again.

Not permitted:

- automatic AI enablement,
- sending raw CSV imports,
- sending full financial history by default,
- hiding the provider or data transfer from the user.

## 10. External services policy in the MVP

The MVP should function without external services for normal product use.

Allowed external service categories in the MVP:

- optional crash/error telemetry,
- optional future AI provider integration.

Not allowed in the MVP without an explicit later decision:

- cloud sync,
- hosted transaction storage,
- remote CSV backup,
- remote analytics containing personal finance data,
- third-party storage of imported finance files.

## 11. User-facing privacy promises for the MVP

Flowcast should be able to truthfully say all of the following:

- Your finance data stays on your device by default.
- Flowcast works without a cloud account.
- Imported bank CSV files are stored only on your device.
- Flowcast does not upload your raw bank CSV files.
- Flowcast does not store your personal finance data on our servers in the MVP.
- Optional AI features are off by default.
- Crash/error telemetry is limited to technical debugging data and must not
  include your raw financial records.

## 12. Required product controls

The MVP or near-MVP implementation should provide:

- a documented local storage location,
- a documented raw CSV storage location,
- local deletion controls later in the roadmap,
- export and backup controls later in the roadmap,
- an AI enable/disable control if AI is added,
- a clear privacy explanation page.

## 13. Operational rules for implementation

Engineers must treat these rules as implementation constraints:

- never attach raw CSV imports to telemetry,
- never log full transaction payloads to remote services,
- never send the local database to a third party,
- never enable AI automatically,
- never require cloud auth for core product use,
- never silently move personal finance data off-device.

For debugging:

- prefer local logs first,
- sanitize before any remote error reporting,
- design telemetry schemas so personal finance fields cannot be included by
  accident.

## 14. Before-selling implications

These choices are acceptable for the MVP and align with the planned paid
product direction:

- fully local/private core product,
- optional AI only with explicit enablement,
- local SQLite storage,
- raw CSV archive retained locally,
- optional encrypted backup later.

Before selling broadly, Flowcast should also add:

- export and delete controls,
- backup and restore flow,
- polished privacy copy,
- a visible privacy settings page,
- telemetry auditing and sanitization tests,
- explicit AI provider disclosure if AI exists.

## 15. Final decision summary

The current product stance is:

- MVP is local-only and local-first.
- Core product use requires no cloud account and no server.
- Local SQLite is the default data store.
- Raw imported bank CSV files are retained locally after import.
- Optional encrypted backup may be added later.
- Crash/error telemetry is allowed for technical debugging only and must never
  contain personal finance data.
- AI is disabled by default and may only be enabled through explicit user
  action.
- Raw CSV files and personally identifiable finance data must never be sent to
  third parties or stored anywhere other than the user's own machine in the
  MVP.
