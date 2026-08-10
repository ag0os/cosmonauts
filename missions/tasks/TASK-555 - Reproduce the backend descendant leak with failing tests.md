---
id: TASK-555
title: Reproduce the backend descendant leak with failing tests
status: Done
priority: high
labels:
  - 'plan:drive-process-reaping'
dependencies: []
createdAt: '2026-08-10T18:47:50.213Z'
updatedAt: '2026-08-10T18:51:47.779Z'
---

## Description

Write the reproduction BEFORE the fix (B-001, B-002). New suite
`tests/driver/backends/process-reaping.test.ts`, spawning real processes,
with an explicit 30s budget — `describe(name, { timeout: 30_000 }, ...)`.
The 15s global is a floor, not a budget for spawn-heavy work.

Both tests must fail against today's backends for the stated reason, not
incidentally. Note the existing codex/claude backend suites stub `Bun`
globally and never spawn anything, so this is the first real-process
coverage of this path; the suite must therefore run somewhere `Bun.spawn`
is real.

Assert liveness explicitly with a pid check. The old detection channel
(driver suites blowing vitest's 5000ms default) is retired: a green suite
is not evidence that nothing leaked.

<!-- AC:BEGIN -->
- [ ] #1 B-001 test: a fake backend binary whose direct child exits 0 after starting a descendant that redirects its stdio and outlives it. Asserts no process in the backend's group is alive once backend.run() settles, and that the returned exitCode is still the direct child's.
- [ ] #2 B-002 test: a fake backend binary whose descendant inherits the stdout/stderr pipes. Asserts backend.run() settles well inside the budget and still returns the direct child's output.
- [ ] #3 Both tests carry their exact markers: @cosmo-behavior plan:drive-process-reaping#B-001 and #B-002.
- [ ] #4 Both tests fail against the unmodified backends, and the failure message names the surviving process or the hang — not a timeout with no explanation.
- [ ] #5 The suite leaves no process behind on either pass or fail: teardown reaps what it spawned. tests/helpers/fs.ts now retries rm on ENOTEMPTY, so a straggler no longer fails loudly — assert it explicitly.
<!-- AC:END -->
