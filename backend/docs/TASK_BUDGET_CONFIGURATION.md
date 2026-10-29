# Task inference budget configuration

`MEND_TASK_COST_CAP` maps to `Settings.max_task_cost` and the assembled
`TaskService` configuration in every runtime mode. Set it to an explicitly
chosen positive finite amount, in the same currency as the configured input
and output prices. No currency, price or spending amount is supplied by Mend.

An absent or empty value remains unconfigured. Invalid, nonpositive,
nonfinite, overlong, overflowing or underflowing values fail configuration
loading with `invalid_configuration`. Direct settings construction also rejects
invalid caps.

The existing inference gate checks accumulated conservative reservations plus
the next reservation before recording usage or invoking generation. Exceeding
the cap produces `budget_exceeded`; a missing cap for a nonfixture store produces
`budget_unconfigured`. An exactly affordable reservation is allowed. This cap
covers configured inference reservations, not runner/cloud fees or an account
spending limit. Existing floating-point accounting and pricing-provenance
requirements are retained.

This wiring does not lift the live release block or the provider/database holds.
The configuration and reservation regressions use offline fixtures only:

```sh
python -m unittest discover -s tests -p test_budget_configuration.py
```
