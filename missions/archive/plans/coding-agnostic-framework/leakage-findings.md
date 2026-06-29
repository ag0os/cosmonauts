---
title: Shared/main leakage findings
plan: coding-agnostic-framework
updatedAt: '2026-06-29T00:00:00.000Z'
---

# Shared/Main Leakage Findings

Generated for TASK-422 from a scan-only review of `domains/shared/**`. The scan looked for cosmo/main/coding-specific strings and agent references that an extracted domain could wrongly inherit from the shared framework domain.

## Scan Commands

Run from the repository root on 2026-06-29:

```bash
rg -n -i '\b(cosmo|cosmonauts|main/cosmo)\b' domains/shared
rg -n -i '\b(main)\b' domains/shared
rg -n -i '\b(coding|cody|coding/[^[:space:]`"'\''\)]+|@cosmonauts/coding|bundled/coding)\b' domains/shared
rg -n '\b[A-Za-z][A-Za-z0-9_-]+/[A-Za-z][A-Za-z0-9_-]+\b' domains/shared
rg -n -i '\b(main/cosmo|coding/(cody|worker|planner|reviewer|verifier|task-manager|quality-manager|integration-verifier|plan-reviewer|spec-writer)|bundled/coding|@cosmonauts/coding)\b' domains/shared
rg -n -i '\b(cody|planner|reviewer|verifier|task-manager|quality-manager|integration-verifier|plan-reviewer|spec-writer|worker)\b' domains/shared
```

Pattern groups used in the table:

- P1 direct qualified domain/agent refs: `main/cosmo`, `coding/<known-role>`, `bundled/coding`, `@cosmonauts/coding`.
- P2 cosmo/main branded strings: `cosmo`, `cosmonauts`, `main`, `main/cosmo`, `COSMO-NNN`.
- P3 coding-specific strings: `coding`, `cody`, `@earendil-works/pi-coding-agent`, `coding-agent`, `coding preset`.
- P4 unqualified agent role refs: `planner`, `task-manager`, `worker`, `reviewer`, `verifier`, `quality-manager`, and related orchestration roles.
- P5 generic slash-shaped refs: `<domain>/<agent>`-style tokens, used as a backstop for missed qualified refs.

## Findings

| Path | Line/pattern | Why it may leak | Disposition | Owner wave |
| --- | --- | --- | --- | --- |
| `domains/shared/**` | P1 direct qualified domain/agent refs returned zero matches. | No direct `main/cosmo`, `coding/<role>`, `bundled/coding`, or `@cosmonauts/coding` references were found in the primary leakage scan. This row explicitly records the zero-finding result for direct qualified refs. | accepted/no-action | Wave 1 |
| `domains/shared/capabilities/spawning.md`; `domains/shared/skills/spawning/SKILL.md`; `domains/shared/extensions/orchestration/chain-tool.ts`; `domains/shared/extensions/orchestration/spawn-tool.ts`; `domains/shared/extensions/orchestration/rendering.ts` | P4 role catalog and chain examples reference `planner`, `task-manager`, `worker`, `reviewer`, `verifier`, `integration-verifier`, and `quality-manager`. | Shared spawning docs and UI labels currently assume the role vocabulary shipped with this repository. An extracted domain inheriting shared spawning guidance may see roles it does not provide. | fix-in-Wave-2 | Wave 2 |
| `domains/shared/skills/agent-packaging/SKILL.md:66` | P2 example package id `cosmo-planner-claude`. | The example bakes a cosmo/planner-flavored package name into generic packaging guidance, which can make package authoring look main-domain-specific. | fix-in-Wave-2 | Wave 2 |
| `domains/shared/skills/pi/SKILL.md`; `domains/shared/extensions/**/*.ts` | P3 references to `@earendil-works/pi-coding-agent`, Pi `coding-agent` docs, and Pi coding-agent imports. | `coding-agent` is Pi's external package/runtime name, not the Cosmonauts bundled `coding` domain or a `coding/<role>` agent ref. Renaming it is outside Cosmonauts domain extraction ownership. | accepted/no-action | Wave 1 |
| `domains/shared/skills/agent-packaging/SKILL.md`; `domains/shared/skills/init/SKILL.md`; `domains/shared/skills/spawning/SKILL.md` | P3 prose such as `coding preset`, `AI coding agents`, and `one-off coding tasks`. | These are generic activity/tool-policy terms rather than dependencies on the bundled coding domain. They are noted as incidental coding-coupling and do not require Wave-1 remediation. | accepted/no-action | Wave 1 |
| `domains/shared/skills/drive/SKILL.md`; `domains/shared/extensions/orchestration/driver-tool.ts` | P2 framework runtime strings including `Cosmonauts driver`, `cosmonauts run drive`, and `cosmonauts-subagent`. | Drive is framework-owned shared functionality, and the `cosmonauts-subagent` backend remains the intended framework backend. This is not a `main/cosmo` agent dependency. | accepted/no-action | Wave 1 |
| `domains/shared/capabilities/tasks.md`; `domains/shared/skills/task/SKILL.md`; `domains/shared/skills/drive/SKILL.md`; `domains/shared/skills/spawning/SKILL.md` | P2 task examples such as `COSMO-NNN`, `COSMO-010`, and `COSMO-007`. | These strings describe the repository's task-system ID convention and examples. They do not bind shared code to the main domain or the bundled coding domain. | accepted/no-action | Wave 1 |

## Report-Only Boundary

This artifact is report-only. No `domains/shared/**` remediation was made from this scan. The only Wave-1 code dependencies related to this plan are handled by other behavior tasks; this deliverable records leakage dispositions and leaves Wave-2 cleanup items as findings.
