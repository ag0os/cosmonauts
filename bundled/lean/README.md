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
| `blast-tests`    | the `blast-radius` signal with a current graph, and a `test` script in `package.json` | unavailable without a graph or a test script; skipped when the graph is stale or the radius lists no tests |
| `plan-vs-actual` | nothing                                                   | always runs                         |
| `mutation`       | fallow (to find the changed functions), Stryker with its vitest runner, vitest in the project, and the graph to select tests | unavailable                         |

A check that cannot run reports `info` with `data.unavailable: true` and
`data.reason`. A check that ran and found nothing to do (no changed
functions, no mutants, no test covering the change) is plain `info`.
`mutation` with no test to select is unavailable when the `blast-radius`
signal found no readable graph, and plain `info` when the graph exists.

## Installing from npm

Stryker (`@stryker-mutator/core`), its vitest runner
(`@stryker-mutator/vitest-runner`) and fallow are devDependencies of
cosmonauts, so an npm installation does not get them. The package ships
`stryker.config.mjs` and `patches/`; the project provides the rest:

- **Stryker**: add `@stryker-mutator/core@10.0.0` and
  `@stryker-mutator/vitest-runner@10.0.0` to the project. Stryker is
  resolved from the cosmonauts package, so a project-level install is found
  only when cosmonauts is installed in the project too. A global cosmonauts
  cannot see the project's Stryker, and `mutation` is unavailable there.
  Stryker runs the project's own vitest.
- **The vitest-runner patch**: `patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch`
  lets tests that call `process.chdir()` run under Stryker (see
  `patches/README.md`). It patches only the runner's branch for vitest
  older than 4.1; with vitest 4.1 or later the patch changes nothing.
  cosmonauts' own `patchedDependencies` applies only when cosmonauts is the
  root project, and a package manager cannot read a patch from inside
  `node_modules`. Copy the patch into the project, commit it, and copy it
  again when cosmonauts is upgraded:
  - bun: copy it to `patches/` and add
    `"patchedDependencies": { "@stryker-mutator/vitest-runner@10.0.0": "patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch" }`
    to `package.json`.
  - pnpm: copy it to `patches/` and add the same entry under
    `patchedDependencies` in `pnpm-workspace.yaml`. pnpm 11 ignores a
    top-level `patchedDependencies` in `package.json`.
  - npm: patch-package expects paths from the project root, so rewrite them
    while copying:
    `sed 's#\([ab]\)/dist/#\1/node_modules/@stryker-mutator/vitest-runner/dist/#g' "node_modules/cosmonauts/patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch" > "patches/@stryker-mutator+vitest-runner+10.0.0.patch"`,
    then add `patch-package` as a devDependency and
    `"postinstall": "patch-package"` to the scripts.

  Without the patch, a selected test that changes directory fails Stryker's
  dry run and the mutation signal is unavailable.
- **fallow** (`fallow@2.54.2`): health, dupes and mutation run only the
  fallow installed in the cosmonauts package's own `node_modules`
  (`node_modules/cosmonauts/node_modules/fallow` and its platform package).
  A fallow in the project's `node_modules` is deliberately not used:
  running a project's binary needs the per-project consent that the
  analysis tools record. No package manager puts fallow there today:
  installing cosmonauts does not install its devDependencies, and
  `npm install fallow` or `bun add fallow` puts it in the project's
  `node_modules`. So in an npm or bun install, `health` and `mutation`
  (both required by default) are unavailable and every `lean_build` with
  the default required signals ends `blocked`. Until this is resolved,
  copy fallow into the package by hand after installing (the platform
  package name depends on the machine, for example `darwin-arm64`):

  ```sh
  bun add -d fallow@2.54.2   # or npm install -D fallow@2.54.2
  mkdir -p node_modules/cosmonauts/node_modules/@fallow-cli
  cp -R node_modules/fallow node_modules/cosmonauts/node_modules/
  cp -R node_modules/@fallow-cli/darwin-arm64 node_modules/cosmonauts/node_modules/@fallow-cli/
  ```

  The package manager does not own this copy, so a reinstall or upgrade of
  cosmonauts can remove it; copy it again afterwards. Leaving `health` and
  `mutation` out of `lean.requiredSignals` (below) also lets runs finish,
  without those checks.
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
