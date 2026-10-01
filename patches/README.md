# Dependency patches

Applied by `bun install` through `patchedDependencies` in `package.json`.

## `@stryker-mutator/vitest-runner@10.0.0`

The runner hard-codes vitest's `threads` pool. `process.chdir()` throws in
worker threads ("not supported in workers"), so any selected test file that
changes directory fails Stryker's dry run. About ten test files here do.
Vitest's own `poolMatchGlobs` does not help: Stryker's pool setting wins.

The patch makes the pool switchable: `STRYKER_VITEST_POOL=forks` runs the
tests in a single fork, where `chdir` works. Without the variable the runner
behaves as upstream. The lean mutation provider
(`lib/lean-run/providers/mutation.ts`) always sets it.

Only the runner's `vitest <4.1` branch is patched, which covers the pinned
vitest major (3). **Redo the patch whenever vitest or the runner is
upgraded**: `bun patch @stryker-mutator/vitest-runner`, edit
`dist/src/vitest-test-runner.js`, then `bun patch --commit` the printed path.
Drop it if upstream gains a pool option.
