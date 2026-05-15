# Flowcast Forecast Fixtures

This directory contains deterministic forecast scenarios derived from
`calculation_contract.md`.

Purpose:

- provide stable, implementation-ready test inputs,
- define expected outputs before forecast code exists,
- make backend regression tests easy to build later,
- keep contract language and test data aligned.

Primary fixture file:

- `forecast_scenarios.json`

Fixture design rules:

- each scenario has a stable `id`,
- all currency values are in EUR,
- dates use ISO `YYYY-MM-DD`,
- expected outputs are deterministic and explicit,
- scenario inputs are split into actuals, assumptions, buckets, goals, and overrides,
- expected outputs focus on values the forecast engine must prove.

Suggested backend usage later:

- load the JSON fixture file,
- map `inputs` into backend domain objects,
- run the forecast or goal planner,
- compare the engine output to `expected`.

The first fixture set intentionally focuses on simple household finance cases
before adding multi-account, credit-card, or bank-integration complexity.
