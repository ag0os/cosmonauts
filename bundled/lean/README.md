# Lean domain

A lead, a builder, a code reviewer and a checker, driven by the `lean_build`
and `lean_review` tools (`extensions/lean-run/`). After each builder attempt
the host runs its own checks over the builder's worktree and hands the
results to the reviewer as facts. The runner is `lib/lean-run/`.

## Host checks and what they need

| Signal kind      | Tool                                                      | Without the tool                    |
| ---------------- | --------------------------------------------------------- | ----------------------------------- |
| `verify`         | `qualityReview.checks` in `.cosmonauts/config.json`, else `bun run typecheck`, `lint` and `test` when `package.json` has them | unavailable                         |
| `health`         | fallow                                                    | unavailable                         |
| `dupes`          | fallow, and `.fallow-baselines/dupes.json` committed at the base | unavailable                   |
| `blast-radius`   | `graph.json` from `cosmonauts architecture generate --file-graph` | unavailable                 |
| `plan-vs-actual` | nothing                                                   | always runs                         |
| `mutation`       | Stryker with its vitest runner, and vitest in the project | unavailable                         |

A check that cannot run reports `info` with `data.unavailable: true` and
`data.reason`. A check that ran and found nothing to do (no changed
functions, no mutants, no test covering the change) is plain `info`.

## Installing from npm

Stryker (`@stryker-mutator/core`), its vitest runner
(`@stryker-mutator/vitest-runner`) and fallow are devDependencies of
cosmonauts, so an npm installation does not get them. The package ships
`stryker.config.mjs` and `patches/`; the project provides the rest:

- **Stryker**: add `@stryker-mutator/core@10.0.0` and
  `@stryker-mutator/vitest-runner@10.0.0` to the project. They are found
  through ordinary package resolution from the cosmonauts package. Stryker
  runs the project's own vitest.
- **The vitest-runner patch**: `patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch`
  lets tests that call `process.chdir()` run under Stryker (see
  `patches/README.md`). cosmonauts' own `patchedDependencies` applies only
  when cosmonauts is the root project, so the project must apply the patch
  with its own package manager: bun and pnpm read `patchedDependencies` in
  the project's `package.json`, pointing at the file under
  `node_modules/cosmonauts/patches/`; npm has no equivalent and needs a tool
  such as patch-package. Without the patch, a selected test that changes
  directory fails Stryker's dry run and the mutation signal is unavailable.
- **fallow** (`fallow@2.54.2`): health and dupes run only the fallow
  installed in the cosmonauts package's own `node_modules`
  (`node_modules/cosmonauts/node_modules/fallow` and its platform package).
  A fallow in the project's `node_modules` is deliberately not used:
  running a project's binary needs the per-project consent that the
  analysis tools record. A plain `npm install fallow` puts it in the
  project's `node_modules`, so health and dupes stay unavailable until fallow
  is installed inside the cosmonauts package.
- **bun**: the default `verify` commands run through `bun run`.

## Required signals

A run is `done` only when every required kind ran and was available in the
last provider pass. Otherwise it ends `blocked` with
`unverified (<kind> unavailable: <reason>)`, or `never ran` as the reason
for a kind no provider produced. Optional kinds that cannot run stay `info`
for the reviewer.

The required kinds are, first to last that is set:

1. the `requiredSignals` parameter of `lean_build`;
2. `lean.requiredSignals` in `.cosmonauts/config.json`, for example
   `{ "lean": { "requiredSignals": ["verify", "mutation"] } }`;
3. the default, `verify`, `mutation` and `health`.

`run.json` records the list a run used. `[]` requires nothing beyond the
rule that `verify` must pass. `lean_review` applies the same list, but only
to the kinds of the providers it ran (by default, `verify` alone).
