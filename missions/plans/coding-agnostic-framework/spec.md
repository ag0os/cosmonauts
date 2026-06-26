## Purpose

Today the framework *assumes `coding` exists*: several `lib/` code paths fall back
to `"coding"` as the default domain (`def.domain ?? "coding"`), and ~73 test files
lean on the bundled `coding` domain as a fixture. That assumption is the main thing
blocking a clean extraction — and it's also just wrong once `coding` is one
installable domain among many. This plan removes the assumption **in place, while
`coding` stays bundled**: the framework's default becomes `main`, and the test
suite stops depending on `coding`-the-domain.

Doing this first is a deliberate de-risking move. It is fully reversible, has **no
external dependency** (unlike the move, which needs the external repo to exist), and
once it lands, the actual extraction (`coding-extraction`, Wave 2) shrinks to a
mechanical cutover that can't leave the repo in a half-migrated state where it can't
drive its own development.

## Users

- **Framework maintainer** — wants the framework to build, test, and run coherently
  without `coding` present, and wants the eventual extraction to be low-risk.
- **Existing coding users** — must see **no behavior change**: `coding` is still
  bundled and works exactly as before throughout this wave.
- **Future domain author** — benefits from a framework whose defaults are
  domain-neutral, so a non-coding domain isn't second-class.

## User Experience

### A shared+main-only project is coherent

A project that runs with only `shared` + `main` active (no `coding`) behaves
sensibly: default-domain resolution, skill requester-domain, and agent-package
domain defaults resolve to `main`, not to a `coding` that may not exist. No code
path silently assumes `coding`.

### Coding still works, unchanged

Because `coding` stays bundled for this entire wave, every existing coding flow —
`coding/*` agents, chains, drives, dump-prompt — behaves exactly as before. This
wave changes *defaults and test fixtures*, not coding's content or runtime behavior.

### The test suite no longer depends on coding-the-domain

The framework's tests use domain-neutral fixtures. Tests that only needed *a*
domain fixture use a neutral id (e.g. `alpha`); tests that exercised the package
system against a real installed domain use a synthetic installable-package fixture
instead of the bundled `coding`. The suite would pass even if `coding` were absent.

### Failure and edge flows

- **No default domain resolvable** — if neither an explicit domain nor `main` is
  available, the framework fails with a clear "no default domain" message rather
  than silently assuming `coding`.
- **Shared/main leakage surfaced** — if the leakage scan finds `cosmo`-specific
  content in `shared` (which an extracted `coding` would inherit), it is reported as
  a finding to escalate, not silently carried.

## Acceptance Criteria

- The framework has **no hardcoded `"coding"` default domain**: the known fallback
  sites (`lib/agents/session-assembly.ts`, `lib/agents/skills.ts`,
  `lib/agent-packages/build.ts`, and any dump-prompt/default-lead fallback) resolve
  to `main` or an explicitly-provided domain — verified by a project that runs with
  only `shared` + `main` active. (The `"coding"` *tool-preset* name in
  `AgentToolSet` and the catalog entry are not domain defaults and are out of scope.)
- Test **Bucket C** (~64 files that use `"coding"` only as a synthetic
  `makeDomain(...)` fixture id or config example) is renamed to a domain-neutral id;
  these tests no longer mention `coding`.
- Test **Bucket B** (~9 framework tests that load the real bundled `coding` as a
  package/scaffold/skill fixture) runs against a **synthetic installable-package
  fixture**, not the bundled `coding` domain.
- The full test suite (`bun run test`), `typecheck`, and `lint` pass with `coding`
  **still bundled**.
- Existing coding behavior is unchanged: `coding/*` agents, chains, and a drive run
  resolve and behave exactly as before (no coding content or runtime change).
- A `shared`/`main` leakage scan is run and its findings reported (cosmo-specific
  content in `shared` that an extracted domain would inherit); fixing it is optional
  in this wave but the report exists.
- Each failure flow above produces a clear, actionable message.

## Scope

Included:
- Decouple the framework's hardcoded `"coding"` default-domain fallbacks (→ `main`
  or explicit). Known sites: `lib/agents/session-assembly.ts` (3),
  `lib/agents/skills.ts`, `lib/agent-packages/build.ts`, plus any
  default-lead/dump-prompt fallback the planner finds.
- Test **Bucket C** — rename the ~64 synthetic-fixture tests to a neutral id.
- Test **Bucket B** — re-point the ~9 framework tests that load real `coding` at a
  synthetic installable-package fixture (a small reusable test helper may be worth
  building here).
- A `shared`/`main` leakage scan (report cosmo-specific content in `shared`).
- Keep `coding` bundled and behaviorally unchanged throughout.

Excluded:
- The physical move of `bundled/coding/` and everything gated on the external repo:
  import rewriting, catalog `source` flip, removing `bundled/` from `files`,
  dogfood/CI wiring, load-parity — all **Wave 2 (`coding-extraction`)**.
- Test **Bucket A** (~13 coding-content tests) — those move with the domain in
  Wave 2.
- The full `shared`/`main` audit-and-fix (only the scan/report is in scope here).
- Domain routing (S4), customization override-layer (S3), declarative-format
  migration (S5).

## Assumptions

- `coding` stays bundled and unchanged for this entire wave; this is what makes the
  work reversible and externally-unblocked.
- The correct framework default domain is `main` (home of `cosmo`, the default
  assistant); the planner confirms per-site that `main` is the right fallback (vs.
  requiring an explicit domain).
- The Bucket C/B split from the `coding-extraction` spec's **Test Decoupling**
  section is the working categorization; exact per-file bucketing is confirmed at
  plan time.
- This wave is a hard prerequisite for `coding-extraction` (Wave 2): the move should
  not start until the framework is coding-agnostic and green.

## Open Questions

- For each hardcoded `"coding"` site, is `main` always the right default, or should
  some sites *require* an explicit domain (no fallback) and error otherwise?
- Should Bucket B share one synthetic-installable-package test helper, or get
  per-test ad-hoc fixtures? (A shared helper also serves Wave 2's parity tests.)
- Is the `shared`/`main` leakage scan purely a report this wave, or should obvious
  cosmo-isms in `shared` be fixed here to avoid them bleeding into the extracted
  `coding` later?
