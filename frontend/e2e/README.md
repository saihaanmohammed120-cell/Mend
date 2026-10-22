# Local sample acceptance

This suite targets the bundled `/sample` experience. It does not authenticate,
submit coding tasks, invoke a model, create a provider job, or prove a repaired
program passes tests. Downloaded receipts must retain `source: demo` and
`execution: not_run`.

Run from the frontend directory in an environment permitted to start a local
development server and browser:

```sh
npx playwright install chromium
npx playwright test
```

For interactive investigation:

```sh
npx playwright test --ui
```

The configuration starts a fresh Next application at `http://127.0.0.1:4173`.
An already running server is deliberately rejected. No external base-URL override
is accepted. The browser fixture aborts attempted protected task/auth/runtime API
and Nebius provider requests and fails the test if any such attempt occurs.
Only public sample controls are exercised; the separate sample SSE player is not
started by this suite.

Coverage includes the failing-to-patched sequence, the preserved blank original
line, continuous line-number gutters, explicit simulated evidence labels, the
downloaded source and regression check, reduced-motion startup, keyboard focus,
brand tokens and mobile horizontal bounds. The passing-check phase remains an
illustration rather than a claim about a live execution.

Reports are written to `playwright-report`; failure artifacts go to
`test-results/playwright`. Traces, screenshots and videos are retained on failure.
These artifacts concern bundled public sample data; use a separate controlled
configuration for any future authenticated acceptance suite.

Test discovery can be checked without launching the application or browser:

```sh
npx playwright test --list
```

A successful discovery or TypeScript check is not browser acceptance. A browser
run must complete and its actual report must be examined before claiming these
checks passed. The current restricted managed environment does not expose an
approved browser-control surface for executing this suite.

The hero review adds light/dark cases at exactly 390px in hero.spec.ts. These cover the single CTA, authored theme, tap bounds, focus outline/gap and page containment. Discovery is not execution; no browser result is established by adding these cases.
