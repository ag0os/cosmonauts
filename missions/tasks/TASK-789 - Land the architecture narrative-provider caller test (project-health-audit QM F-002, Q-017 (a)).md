---
id: TASK-789
title: >-
  Land the architecture narrative-provider caller test (project-health-audit QM
  F-002, Q-017 (a))
status: To Do
priority: medium
labels:
  - follow-up
  - quality-manager
  - testing
dependencies: []
createdAt: '2026-09-29T12:51:55.846Z'
updatedAt: '2026-09-29T12:51:55.846Z'
---

## Description

Post-plan follow-up ruled by the human on 2026-09-29 (round 10, Q-017 (a)). The Quality Manager review of plan project-health-audit (run qm-d213250a, finding F-002) found that cli/architecture/narrative-provider.ts delegates session construction to the shared createToollessPiSession in cli/pi-session.ts without any caller-level test, so a misrouted projectRoot, model, system prompt, or tool-less configuration would pass the suite. The finished test was written during the review phase but could not land inside the plan because it post-dated the ratified analyzed commit (plan D-040). Land it verbatim from the preserved proposal file `missions/reviews/qm/project-health-audit-run-2/proposed-narrative-provider.test.ts.txt` (see the acceptance criteria). No production code change is needed; do not modify any existing test.

<!-- AC:BEGIN -->
- [ ] #1 tests/cli/architecture/narrative-provider.test.ts exists with the content of missions/reviews/qm/project-health-audit-run-2/proposed-narrative-provider.test.ts.txt (same describe/test names; mock of the Pi package mirrors tests/cli/memory/subcommand.test.ts)
- [ ] #2 The mutation probe fails the first case: replacing the forwarded options in createNarrativeSession with { projectRoot, systemPrompt: 'x' } makes 'builds a tool-less session at the project root with the architecture prompt and parses strict JSON' fail; source restored byte-identical afterwards
- [ ] #3 bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all exit 0
- [ ] #4 No file outside tests/cli/architecture/narrative-provider.test.ts changes
<!-- AC:END -->
