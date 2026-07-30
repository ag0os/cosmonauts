---
id: TASK-526
title: Guarantee native provider process evidence and complete-tree termination
status: Done
priority: high
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.754Z'
updatedAt: '2026-07-29T20:08:53.622Z'
---

## Description

Remediate merged findings F-001, PR-001, SR-005. The package-manager shim and direct-child-only termination can normalize native analyzer signal death to code 0 and orphan descendants. Resolve the installed analyzer without PATH/global/npx, preserve native exit/signal evidence, and guarantee bounded process-tree cleanup cross-platform.

### Verified root cause (reproduced independently, 2026-07-29)

`node_modules/.bin/fallow` is not the analyzer. It is a Node shim (symlink to
`../fallow/bin/fallow`) whose operative body is:

    try { execFileSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' }) }
    catch (e) { if (e.status !== undefined) { process.exit(e.status) } throw e }

On signal death Node sets `e.status = null` and `e.signal` to the signal name.
Because `null !== undefined` is true, the shim calls `process.exit(null)`, which
Node exits as code **0**. With `stdio: 'inherit'`, any JSON the analyzer already
printed has reached the adapter. The adapter classifies code 0 plus classifiable
JSON as completed, so a crashed analyzer is reported as a clean analysis.

Reproduced with a child that prints a valid envelope then SIGTERMs itself:
shim exit code 0, JSON intact on stdout.

The same layering explains the orphan finding: abort and timeout signal the
shim, and killing the shim does not kill the binary it launched via
`execFileSync`.

This is the failure D-008 rejected `pi.exec` for (`code ?? 0`), reintroduced one
layer down by the resolution target. INV-3 is ratified and outranks derived
convenience, so this blocks the slice.

`D-015` already reads "`node_modules/.bin` **or platform equivalent**", so
resolving the platform package's native binary is within its letter — a
precision fix, not an amendment. If implementation shows a genuine collision
with `D-015`, stop and escalate rather than reverting to the shim.

<!-- AC:BEGIN -->
- [x] #1 Project-local Fallow execution targets a shell-free process boundary whose native signal cannot be reported as completed code 0.
- [x] #2 Abort and timeout terminate the provider and all descendants within a fixed bound while preserving the initiating reason and output captured before termination.
- [x] #3 Installed-provider tests cover crash, abort, timeout, descendant cleanup, and supported POSIX/Windows resolution without PATH, global binaries, or mutable fetch.
- [x] #4 INV-3 failure classification and the existing successful real-engine flows remain intact.
<!-- AC:END -->
