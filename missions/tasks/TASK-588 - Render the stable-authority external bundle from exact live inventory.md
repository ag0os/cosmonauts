---
id: TASK-588
title: Render the stable-authority external bundle from exact live inventory
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-587
createdAt: '2026-08-25T23:05:19.081Z'
updatedAt: '2026-08-26T05:37:48.180Z'
---

## Description

Owns B-010 from AC-005 at Implementation Order step 7. Seam/files: `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/render.ts`, `lib/harness-runtime-inventory.ts`, `external-skills/cosmonauts/SKILL.md`, `external-skills/cosmonauts/chains/SKILL.md`, `external-skills/cosmonauts/skills/SKILL.md`, `external-skills/cosmonauts/plans/SKILL.md`, `external-skills/cosmonauts/tasks/SKILL.md`, and `tests/harness-adapters/inventory.test.ts`. AC-005 and INV-001/INV-003/INV-004/INV-005 are ratified stop-and-escalate ground; D-011/D-012/D-013/D-017/D-020 define the exact derived contract. No static inventory, root chain-list flag, Gemini/`open-code` support, marketplace distribution, live migration, or live-command write is permitted.

<!-- AC:BEGIN -->
- [x] #1 B-010/D-011: `references/generated-inventory.md` renders deterministic exact bytes with the three sorted/escaped sections and exactly the Claude-command, Claude-skill, and Codex-skill path rows; no agent-package, declared, or unsupported row appears.
- [x] #2 B-010/INV-004/D-012: authored bundle files contain no mirrored chain, skill, agent, or path inventory and use only `cosmonauts run chain list` plus `cosmonauts skills list --json` fallbacks; no new root chain-list surface exists.
- [x] #3 B-010/D-017/D-007: the external bundle remains one `external-skill:cosmonauts` stable-authority asset with output identity `cosmonauts`, its complete nested tree, five reserved nested names, and `defaultScope: "personal"` rather than fragmented candidates.
- [x] #4 B-010: any changed effective chain, visible skill, supported path fact, escaping input, or generated wrapper input makes an intact managed copy/wrapper `source-ahead`; authored-link content remains live under the registered wrapper shape.
- [x] #5 B-010/D-020: provenance records `generatingProjectRoot`; cross-project sync reports `regenerated-from-other-project` naming the previous generator, and cross-project check reports `source-ahead` with that annotation, never `current`.
- [x] #6 B-010/D-013: cwd, checkout, monorepo, or package relocation alone never makes the generic personal bundle foreign; sandboxed direct/flat/generated link-wrapper loading succeeds without project-plugin execution or explicit link fallback to copy.
- [x] #7 `tests/harness-adapters/inventory.test.ts` contains `renders the stable-authority external bundle with exact live inventory bytes and fallbacks` with marker `@cosmo-behavior plan:harness-adapters#B-010` and exact-byte/mutation cases prove schema, escaping, fallback, one-asset, stable-authority, fact-drift, and generating-project reporting.
<!-- AC:END -->
