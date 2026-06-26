## Purpose

The `domains` vision is many independently-developed, installable agentic domains.
The archived `domain-authoring` plan made `coding` *structurally* portable (a clean
single-domain package root, framework prompts separated, a documented
framework/domain boundary) but deliberately left it bundled in-tree. This plan is
**Wave 2 — the physical cutover**: `coding` moves to its own repo and becomes
**install-on-demand**, proving the extraction path end-to-end and shrinking the
framework to its core (framework + `shared` + `main`).

**Prerequisite — Wave 1 (`coding-agnostic-framework`) must be merged first.** That
wave already removed the framework's hardcoded `"coding"` defaults (→ `main`) and
decoupled the test suite's *framework-internal* dependence on the bundled `coding`
domain (test Buckets C and B), all while `coding` stayed bundled. So by the time
this plan runs, the framework no longer assumes `coding` exists; what remains here
is the **irreversible move itself** — physically relocating `coding`, rewriting its
imports, moving the coding-content tests (Bucket A) with it, flipping the catalog,
removing `bundled/`, and wiring this repo's dogfood/CI loop. This is the cutover
that's gated on the external repo existing and that changes how this repo drives its
own development; keeping it separate from the reversible Wave-1 prep avoids a
half-migrated state.

## Users

- **Framework maintainer** — wants the framework repo to build, test, and ship
  without `coding` in the tree, and to develop `coding` and the framework together
  without friction.
- **Coding-domain author** — develops `coding` in its own repo, on its own cadence,
  and dev-loops it against a local framework checkout.
- **End user / external orchestrator** — installs `coding` when they want
  coding-domain capabilities (`cosmonauts install coding`), rather than getting it
  implicitly bundled.
- **This repo, dogfooding itself** — cosmonauts drives its own development with
  `coding/*` agents; after extraction it consumes `coding` as a linked external
  domain like any other consumer.

## User Experience

### Installing coding (end user)

`coding` is no longer in the framework tarball. A user who wants it installs it
from the catalog by name; the catalog entry resolves to the external git repo:

```
cosmonauts install coding        # resolves catalog -> github:<org>/cosmonauts-coding
cosmonauts --list-domains        # now shows shared, main, coding
```

Without it installed, the framework still works for non-coding domains; coding
agents/chains are simply absent (and `cosmonauts init` may offer to pull it).

### Developing both repos together (maintainer / domain author)

A contributor working on the framework and `coding` simultaneously links a sibling
checkout instead of installing a published version:

```
cosmonauts install --link ../cosmonauts-coding
```

Edits in the linked repo are picked up live; no publish/reinstall loop. The
framework repo documents this as the standard dev setup.

### This repo dogfooding coding

The cosmonauts repo's own development and CI need `coding` present (tests and
drives use `coding/*` agents). The repo's setup and CI link or install `coding`
as a setup step, so `bun run test` and drive runs behave as before — the only
change is that `coding` arrives via the package system instead of from `bundled/`.

### Authoring against a coding-less framework

The framework no longer assumes `coding` exists: default-domain resolution, skill
requester-domain, and agent-package defaults fall back to `main` (or are
explicitly required), so a project with only `shared` + `main` is fully coherent.

### Failure and edge flows

- **Coding not installed, coding work requested** — asking for a `coding/*` agent
  or chain when `coding` is not installed produces a clear "domain `coding` is not
  installed; run `cosmonauts install coding`" message, not a generic not-found.
- **Link target missing** — `--link` to a path that does not exist or is not a
  valid domain package fails with a message naming the path and what was expected.
- **Version skew** — `coding` declares a compatible framework-version range in its
  manifest, and the install/setup documents the policy. A *runtime* compatibility
  comparator is **out of scope this wave** unless explicitly budgeted (there is no
  framework-version comparator in the substrate today); see Open Questions.
- **Missing dogfood setup** — if the link/install step is skipped, a test-runner
  guard fails with an actionable "coding domain not linked" signal, not obscure
  resolution errors.

## Acceptance Criteria

- The framework npm tarball (the `files` allowlist) does **not** include `coding`;
  `bundled/coding/` no longer ships with the framework package.
- The catalog resolves a **git-URL source verbatim**: a catalog entry whose source
  is a `github:`/`https://`/`file://` URL passes through `resolveCatalogSource`
  unmodified (only relative `./` sources are joined onto the framework root), proven
  by a unit test. With `coding`'s entry pointed at the git URL, `cosmonauts install
  coding` installs a working domain.
- After installing (or linking) `coding`, `cosmonauts --list-domains` and
  `--list-agents` show `coding` and its agents, and a coding chain resolves and runs
  — identical behavior to the previously-bundled domain (load parity).
- `cosmonauts install --link <path>` makes a sibling `coding` checkout active with
  live edits, with no publish/reinstall step.
- The framework's own test suite passes with `coding` **removed from `bundled/`**:
  the Bucket A coding-content tests have moved to the coding repo, and
  `grep -rl 'bundled/coding' tests/` in the framework repo returns **nothing**.
  (Buckets C and B were already neutralized in Wave 1, so the framework suite is
  already coding-agnostic going in.)
- **Dev-mode resolution works with `coding` linked and no `bundled/` present** — the
  framework-repo detection (`isCosmonautsFrameworkRepo`) no longer depends on
  `bundled/` existing, and a linked `coding` is discovered in dev.
- This repo's documented dogfood setup (link/install `coding`) makes `bun run test`
  and drive runs work end-to-end as before; a test-runner guard emits "coding domain
  not linked" when the setup step is skipped.
- The extracted coding repo typechecks standalone: imports use the
  `cosmonauts/lib/...` package form with no remaining framework-relative
  (`../../../lib/...`) imports, **and a runtime (not just type-only) import from
  `cosmonauts/lib/...` resolves** in the extracted repo under Bun/Node — proving the
  subpath actually works, not just that type-only imports get erased.
- **Cutover ordering / rollback:** `bundled/` is deleted **only after** both
  `--link` and a pinned-git install have each demonstrated load parity *and* a green
  dogfood drive while `bundled/` still exists. The catalog-resolution change and the
  `bundled/` deletion land in **separate, independently-revertable commits**.
  (The "linked > leftover bundled" precedence is a *pre-deletion transition gate*,
  not a final-state criterion.)
- **Wave-1 leakage precondition:** the `shared`/`main` leakage findings from Wave 1
  are resolved, or each is explicitly accepted with sign-off, before the move
  begins — `shared` is the stdlib the extracted `coding` inherits and can't fix
  itself post-extraction.
- Each failure flow above produces a specific, actionable message (coding not
  installed, link target missing, missing/skipped dogfood setup).
- Documentation describes the install-on-demand model, the `--link` dev loop, and
  this repo's dogfood setup.

## Scope

Included:
- Move `bundled/coding/**` to its own repo as a standalone installable package
  (it is already a clean single-domain package with `path: "."`).
- **Rewrite coding's framework-relative imports** (`../../../lib/...`) to the
  package form (`cosmonauts/lib/...`). Factor the eject rewrite **regex** into a
  standalone helper (don't call full `ejectDomain()`, which also copies/validates).
  The extracted repo declares `cosmonauts` as a (dev)dependency. **First prove the
  subpath resolves:** `package.json` has no `exports`/`imports` map and ships `lib/`
  as raw `.ts`, so confirm `cosmonauts/lib/...` resolves from a sibling repo under
  both tsconfig and the Bun/Node runtime (coding's framework imports are all
  type-only today, so typecheck can pass while runtime is never exercised — a latent
  trap). If it doesn't resolve, add an `exports`/`imports` subpath map to the
  framework `package.json` as a task here.
- **Make the catalog resolve a git-URL source — this is a framework-code change, not
  a data flip.** `resolveCatalogSource` (`lib/packages/catalog.ts:60-67`)
  unconditionally `join()`s `frameworkRoot` onto every source, so setting `coding`'s
  source to `github:org/...` yields a bogus local path that never reaches the
  installer's git transport. Make `resolveCatalogSource` (and its callers in
  `cli/packages/subcommand.ts` and `cli/update/subcommand.ts`) detect `https://`,
  `github:`, `file://` schemes and pass them through verbatim, only `join()`-ing
  relative `./` sources. Then point `coding`'s catalog entry at the git URL.
- Remove `bundled/` from the framework's npm `files` allowlist and delete the
  now-empty `bundled/` tree — **and audit the dev-mode coupling**:
  `isCosmonautsFrameworkRepo()` (`lib/packages/dev-bundled.ts:22-27`) currently gates
  dev-bundling on `bundled/` *existing*, so removing it silently disables dev-mode
  bundled discovery. Redefine the framework-repo heuristic (name + `.git`, drop the
  `bundled/` requirement) and update all callers of
  `isCosmonautsFrameworkRepo`/`discoverFrameworkBundledPackageDirs`.
- Wire and document the `--link` dev loop for both-repos development.
- Set up this repo's dogfood path: a documented local setup step that links/installs
  `coding` so `bun run test` and drives keep working, plus a test-runner guard that
  emits "coding domain not linked" when it is missing. (This repo has **no CI
  workflow today**; creating CI is separate ops work, not assumed here — see
  Excluded.)
- Move the **Bucket A** coding-content tests (~13) to the coding repo alongside the
  personas/chains/skills they cover. (Buckets C and B were already handled in Wave 1;
  see **Test Decoupling**.)
- Load-parity verification (bundled vs. installed/linked).

Excluded:
- Domain routing (S4), customization override-layer + asset-granular merge (S3),
  declarative-format migration (S5), domain composition/inheritance.
- Authoring new `coding` content or new domains (e.g. `product`).
- A remote catalog/marketplace beyond git-URL resolution.
- Standing up the external repo's hosting/CI infrastructure itself (an ops step the
  plan depends on but does not design). This repo also has no CI workflow today;
  creating one is separate work — this plan delivers a documented local dogfood setup
  + a test-runner guard, not a CI pipeline.
- Re-auditing the `shared`/`main` split beyond what extraction strictly requires
  (Wave 1 produces the leakage scan; this plan only gates on its findings being
  resolved-or-accepted, per the precondition AC below).

## Test Decoupling

**~92 test files reference `coding`; ~27 load the *real* bundled domain; ~65 use
`"coding"` only as a synthetic name.** (A code review measured 92/27/65; earlier
drafts said 86/73 — the relative shape holds, the absolute is reconciled here.) The
raw count is misleading: only a small cluster actually tests the coding domain.

**Bucketing rule (the discriminator is "loads the real bundled `coding`", NOT
whether a fixture is named "coding").** At plan time, derive buckets from a fresh
`grep -rl coding tests/` and reconcile to **zero remainder** — every match assigned
A, B, C, or keep. The illustrative lists below are a starting point, not frozen
truth, and the lists are known to be non-exhaustive (e.g. `coding-domain-rename`,
`extensions/orchestration`, `docs/domain-authoring`, `skills/discovery` were
unbucketed in earlier drafts).

The split is **divided across the two waves** — Buckets C and B are
framework-internal and handled in **Wave 1 (`coding-agnostic-framework`)**; only
**Bucket A** (the coding-content tests) is this plan's concern, because it moves
with the domain. All three are documented here for the full picture:

**Bucket A — Coding-content tests → MOVE to the coding repo (~13 files). [THIS PLAN / Wave 2]** These
test coding's own personas, skills, and chains; they belong with the content they
cover. All load the real coding domain and assert on coding-specific content:
`tests/prompts/{cody,worker,planner,reviewer,quality-manager,spec-writer,verifier,
task-manager,plan-reviewer,integration-verifier,tdd-skill,healthy-codebase-harness}.test.ts`
and `tests/domains/coding-chains.test.ts`.

**Bucket B — Framework tests that load real coding as a fixture → ADJUST. [Wave 1]**
They test framework behavior (package catalog/scanner, CLI
export/packages/skills/update, scaffold, skill resolution, prompt loader) but
currently use the bundled coding domain as a convenient real package. Re-point them
at a synthetic installable package fixture, or run them against linked/installed
coding: `tests/packages/{catalog,scanner}.test.ts`,
`tests/cli/{export,packages,skills,update}/subcommand.test.ts`,
`tests/config/scaffold.test.ts`, `tests/agents/skills.test.ts`,
`tests/prompts/loader.test.ts`. **Also reclassify here (they load the real domain
despite looking synthetic):** `tests/domains/main-domain.test.ts`
(`loadDomainsFromSources` on the bundled coding dir) and `tests/cli/dump-prompt.test.ts`
(`dumpPrompt(['-d','coding'])`) — a fixture rename will NOT decouple them.

**Bucket C — Synthetic-fixture tests → RENAME IN PLACE (~64 files). [Wave 1]** The majority.
They never load the real domain; they just name a synthetic `makeDomain(...)`
fixture (or a config/binding example) `"coding"`. They stay in the framework; the
fixture id changes to something domain-neutral (e.g. `alpha`/`test`). Low-risk,
mechanical. Examples: `tests/{runtime,...}`, `tests/domains/{bindings,validator}.test.ts`,
`tests/agents/{resolver,qualified-role,session-assembly,
runtime-identity}.test.ts`, `tests/agent-packages/*.test.ts`,
`tests/cli/dump-prompt.test.ts`.

Implication: the raw ~92-tests figure overstates the risk, and the split across waves
shrinks it further. Buckets C (~64 mechanical renames) and B (~9 fixture
re-pointings) land in Wave 1 while `coding` is still bundled, so by the time this
plan runs only Bucket A (~13) remains — and it moves wholesale alongside the
personas/chains it covers. Exact per-file bucketing is confirmed at plan time, but
the shape and magnitude are known.

## Prior Art & Reuse

This extraction is a **move + wire**, not a new build. The packaging substrate is
feature-complete and prior plans designed exactly this path — the planner should
build on them, not re-derive:

- **`framework-extraction`** (archived, completed) designed the coding-as-installable
  model — bundled package structure, catalog, first-run install UX, dev-mode
  auto-include — and explicitly named "actually extracting the coding domain" as
  separate follow-up. That follow-up is this plan.
- **`package-system`** (archived) built the install transports, manifest +
  validation, multi-source loading, the `DomainResolver`, and merge strategy.
- **`domain-eject-and-tiers`** (archived) built `eject`, the override/precedence
  tiers, and the **import-rewrite regex** (`from "../../lib/..."` →
  `from "cosmonauts/lib/..."`) — reuse this exact mechanism for the coding move.
- **`domain-authoring`** (archived) made coding a clean `path: "."` package and
  moved framework prompts to `lib/prompts/framework/`.

Built substrate to use as-is (do not rebuild): `lib/packages/` (installer with
git/local/symlink-`--link`/catalog transports, `eject`, `update`, scopes, manifest
validation), `lib/domains/` (multi-source loader + 7-tier precedence merge + the
`domain-root` source kind), and the static catalog where `coding` is registered.
Note the catalog source change is **code, not data**: `resolveCatalogSource` joins
every source onto the framework root today, so git-URL passthrough must be added
(see Scope).

**Caution:** the archived plans predate the `domain-authoring` migration, so some of
their structural details are stale (they describe the old nested `bundled/coding/coding/`).
Trust current code over archived plan text.

## Assumptions

- The external repo name/URL (e.g. `cosmonauts-coding`) is a detail to be fixed at
  plan time; the spec assumes a single git-hosted repo the catalog points to.
- `coding` is already a clean single-domain package (`path: "."`, prompts separated)
  from `domain-authoring`; no further restructuring of its internals is needed to
  move it. It stays **`portable: false`** — `portable` is for agent-less,
  stdlib-style domains; `coding` is a full domain with a lead (`cody`), so it is not
  portable.
- The `shared`/`main` split audit (`domains.md`: move cosmo-specific out of `shared`,
  reusable-by-any-domain out of `main`) is an open S1 item. It is **not a hard
  blocker** but is a real prerequisite-in-spirit: an extracted `coding` inherits
  `shared` as its stdlib fallback, so any `cosmo`-specific leakage in `shared` would
  bleed into `coding`. The full audit stays out of this plan's scope; the plan
  assumes `shared` is neutral enough and flags any leakage found as a risk to
  escalate.
- The install transports, catalog, `--link`, and `eject` mechanisms exist and work
  (~80% substrate); this plan uses them rather than building them.
- Pi lockstep versioning continues; `coding` will pin a compatible framework
  version range (exact policy is an open question below).
- The framework keeps `shared` (stdlib) and `main` (default assistant + `cosmo`)
  bundled; only `coding` (and future domains) externalize.

## Open Questions

- What is the external repo's name/org/URL, and who hosts its CI?
- How does this repo obtain `coding` for dogfooding — link a checked-out sibling, or
  install a pinned git ref? (Pinned ref is reproducible; link is simpler for
  co-development. No CI exists yet, so this is a local-setup decision for now.)
- Should `cosmonauts init` auto-offer/auto-pull `coding` for new coding projects,
  or is install always explicit?
- **Leaning resolved — version policy:** recommend a **compatible-range pin** in
  `coding`'s manifest (given the Pi lockstep precedent), with **no runtime
  comparator this wave**. Confirm, and decide whether to budget a `frameworkVersion`
  comparator + manifest-validation check as a separate task or defer entirely.
- **Leaning resolved — `bundled/` fate:** remove it entirely (no empty extension
  point); the framework-repo detection is updated to not require it. Confirm before
  cutover, since `isCosmonautsFrameworkRepo` and dev-bundling depend on it.
- Tests are bucketed in **Test Decoupling** (A=~13 move [this plan], B=~9 + C=~64
  [Wave 1]). Residual unknown for this plan: whether the moved Bucket A tests need a
  coding-side test harness/fixtures the framework currently provides, so the coding
  repo can run its own suite standalone. (Bucket B/C dispositions are Wave 1's.)
- Should there be a deprecation/transition period where `coding` is still resolvable
  from the old bundled path, or is it a hard cut (consistent with the
  `domain-authoring` migration's hard-cut precedent)?
