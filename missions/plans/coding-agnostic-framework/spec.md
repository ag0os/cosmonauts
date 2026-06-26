## Purpose

Today the framework *assumes `coding` exists*: several `lib/`/`cli/` code paths fall
back to `"coding"` as the default domain (`def.domain ?? "coding"`) — and the drive
even reaches into `bundled/coding` for its default prompt envelope — while the bulk
of the ~92 coding-referencing test files (the ~65 synthetic-name + the handful that
load the real domain as a fixture) depend on `coding`. That assumption is the main thing
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

- The framework has **no hardcoded `"coding"` default domain** — enforced by a
  completeness gate, not an enumerated list: `grep -rn '?? "coding"' lib/ cli/`
  returns **zero** domain-default matches (the `"coding"` *tool-preset* name in
  `AgentToolSet`/`agent-packages/definition.ts` and the catalog entry are explicitly
  carved out — they are not domain defaults). Known sites to fix: `session-assembly.ts`
  (lines 122/138/155), `agent-packages/build.ts:126`, **`lib/agents/skills.ts:111`**
  (`requesterDomain ?? "coding"`), and **`cli/main.ts:439`** — both of the latter
  were missing from earlier drafts. (`lib/agents/resolve-default-lead.ts:42` already
  uses `main` and needs no change; note `loader.ts:164` sets `domain` on every
  *loaded* agent, so these fallbacks only fire for synthetic/hand-built defs.)
- **Each fixed site is actually exercised by a test** — not merely covered by a
  "shared+main-only project" smoke check, since CLI-inspection (`list-agents`,
  `dump-prompt`) and skill-resolution paths may not run in that gate. Construct a
  domain-less agent def (or run the relevant CLI path with only `shared`+`main`) to
  fire each fallback and assert it resolves to `main`.
- **The drive default-envelope no longer reaches into `coding`.** Today
  `cli/drive/subcommand.ts` `resolveDefaultEnvelopePath()` hardcodes
  `bundled/coding/drivers/templates/envelope.md` and throws if absent — framework
  code depending on coding content, and the dogfood path. Move the default envelope
  to a framework/shared-owned location (it is orchestration content, not coding
  content) and resolve it there. AC: a default-envelope drive (no `--envelope`) works
  with `coding` present, and the no-envelope failure produces a clear message.
- Test **Bucket C** (the synthetic-fixture tests that use `"coding"` only as a
  `makeDomain(...)` id or config example) is renamed to a domain-neutral id; these
  tests no longer mention `coding`.
- Test **Bucket B** (framework tests that load the real bundled `coding` as a
  package/scaffold/skill fixture — including `tests/domains/main-domain.test.ts` and
  `tests/cli/dump-prompt.test.ts`, which load the real domain despite looking
  synthetic) runs against a **synthetic installable-package fixture**, not the
  bundled `coding` domain.
- The full test suite (`bun run test`), `typecheck`, and `lint` pass with `coding`
  **still bundled**.
- Existing coding behavior is unchanged: `coding/*` agents, chains, and a drive run
  resolve and behave exactly as before. **In particular, this repo's own dogfood
  drives still resolve to the intended `coding/*` agents after the default flips
  from `coding` to `main`** — verified by an actual drive run; no drive/chain/config
  in this repo silently relied on `coding` being the default domain.
- The `shared`/`main` leakage scan produces a **named, gating deliverable**: a
  written findings list (in this plan's review artifact or `domains.md` S1) of
  cosmo-/main-specific strings or agent refs found under `domains/shared`, each with
  a disposition (escalate / fix-in-Wave-2 / fix-now). The pass bar is "the list
  exists with a disposition per item" — zero findings is a valid list. (Fixing is
  out of scope this wave; the dispositions feed Wave 2's precondition gate.)
- Each failure flow above produces a clear, actionable message.

## Scope

- Decouple the framework's hardcoded `"coding"` default-domain fallbacks (→ `main`
  or explicit), driven to zero via the `grep -rn '?? "coding"' lib/ cli/` gate.
  Sites: `lib/agents/session-assembly.ts` (122/138/155), `lib/agent-packages/build.ts:126`,
  `lib/agents/skills.ts:111`, `cli/main.ts:439`, plus any the gate surfaces.
- Relocate the **drive default-envelope** out of `coding`: move
  `bundled/coding/drivers/templates/envelope.md` to a framework/shared-owned location
  and update `resolveDefaultEnvelopePath()` to resolve it there (orchestration
  content, not coding content; and the dogfood path).
- Test **Bucket C** — rename the synthetic-fixture tests to a neutral id.
- Test **Bucket B** — re-point the framework tests that load real `coding` (incl.
  `main-domain.test.ts`, `cli/dump-prompt.test.ts`) at a synthetic
  installable-package fixture. Build one small reusable fixture helper (it also
  serves Wave 2's parity tests).
- A `shared`/`main` leakage scan producing a gating findings list with a disposition
  per item (scan-only this wave; dispositions feed Wave 2).
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
- **Leaning resolved:** the `shared`/`main` leakage scan is **scan-only this wave** —
  it produces a gating findings list with a disposition per item; fixes (if any) land
  in Wave 2 or are explicitly accepted. Confirm.
- Where should the relocated drive default-envelope live — under
  `lib/prompts/framework/` (alongside base/runtime), a `shared`-domain drivers
  location, or resolved from the active drive domain via the resolver? (It is
  orchestration content; pick the home that keeps the framework drive-capable with
  no domain installed.)
