---
id: TASK-280
title: 'Plan 3: Add compile:drive-step script to package.json'
status: To Do
priority: low
labels:
  - devops
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-276
createdAt: '2026-05-04T20:21:33.225Z'
updatedAt: '2026-05-04T20:21:33.225Z'
---

## Description

Implements Implementation Order step 9.

**Cross-plan invariant — P3-INV-10:**
`compile:drive-step` in `package.json` is for DEV-TIME pre-compile only (developer convenience). The actual runtime compilation step runs inside `startDetached` (TASK-278) at run-creation time. Both target `lib/driver/run-step.ts`. Do not conflate the two.

<!-- AC:BEGIN -->
- [ ] #1 package.json has a "compile:drive-step" script: "bun build --compile lib/driver/run-step.ts --outfile bin/cosmonauts-drive-step".
- [ ] #2 Running bun run compile:drive-step from the project root succeeds and produces bin/cosmonauts-drive-step.
- [ ] #3 The script or adjacent documentation (README or comment) notes this is a dev-time convenience; runtime compilation happens inside startDetached (P3-INV-10).
<!-- AC:END -->
