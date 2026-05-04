---
id: TASK-272
title: 'Plan 3: Implement driver-script.ts bash runner generator'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies: []
createdAt: '2026-05-04T20:20:28.005Z'
updatedAt: '2026-05-04T20:20:28.005Z'
---

## Description

Implements Implementation Order step 7. Decision Log: D-P3-12. Quality Contract: QC-003.

Create `lib/driver/driver-script.ts` exporting `generateBashRunner(workdir: string): string`.

**Cross-plan invariants:**
- P3-INV-7: The bash `trap` removes ONLY `run.pid` on EXIT — do NOT remove `run.completion.json`. The binary writes `run.completion.json`; bash is not responsible for it.
- D-P3-12: Implementer may choose bash or `Bun.spawn` detached in `startDetached` (step 8). This task ships the bash generator regardless.

**Expected generated script (~5 lines):**
```bash
#!/usr/bin/env bash
set -uo pipefail
WORKDIR="$(cd "$(dirname "$0")" && pwd)"
trap 'rm -f "$WORKDIR/run.pid"' EXIT
exec "$WORKDIR/bin/cosmonauts-drive-step" --workdir "$WORKDIR"
```

The script self-resolves its own directory so it works regardless of invocation CWD.

<!-- AC:BEGIN -->
- [ ] #1 generateBashRunner(workdir) exported from lib/driver/driver-script.ts returns a syntactically valid bash script.
- [ ] #2 The generated script's trap removes only run.pid on EXIT — does not remove run.completion.json — per P3-INV-7.
- [ ] #3 The script execs $WORKDIR/bin/cosmonauts-drive-step --workdir "$WORKDIR".
- [ ] #4 `bash -n <generated-script>` passes for workdir paths containing spaces and special characters in the path (QC-003).
- [ ] #5 Tests in tests/driver/driver-script.test.ts include a snapshot test and bash -n validation against paths with spaces and special characters.
<!-- AC:END -->
