---
id: TASK-813
title: >-
  Drive Git guard: full git option grammar and wrapper forms (driver-hardening
  Claude review 3, R3-1)
status: To Do
priority: medium
labels:
  - follow-up
  - backend
  - driver
dependencies: []
createdAt: '2026-09-30T11:41:39.789Z'
updatedAt: '2026-09-30T11:41:39.789Z'
---

## Description

Post-plan follow-up from driver-hardening (improvement row 20; `missions/reviews/claude/driver-hardening-round-3.md` R3-1). The Bash guard (`lib/agents/drive-worker-tool-guard.ts`) still allows: `git switch -qf`/`-fq` clusters, `git --no-advice checkout -f`, subshell and `bash -lc` wrappers, `exec`/`time`/`timeout` prefixes, and an absolute git path. Each discards tracked edits; the pre-spawn snapshot (D-020) does not cover the current attempt's own edits, and INV-006 ranks the refusing guard above recovery.

<!-- AC:BEGIN -->
- [ ] #1 The classifier tokenizes every git verb's options with git's own grammar (short clusters, long-option prefixes, global options before the verb) and matches the binary by basename (absolute paths, exec/time/timeout prefixes, sh/bash -c/-lc wrappers).
- [ ] #2 Tests for every form listed in R3-1 on the guard and on the probe test-command path, red first; the documented residuals in lib/driver/README.md are updated.
<!-- AC:END -->
