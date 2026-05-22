---
source: archive
plan: artifact-format-redesign
distilledAt: 2026-05-22T12:48:36Z
---

# Work-document format redesign: spec, plan, architecture + behavior spine + gate contracts

## What Was Built
Cosmonauts now has a canonical work-artifact system centered on `/skill:work-artifacts`: workflow tiers, `spec.md`, behavior-first `plan.md`, durable `architecture.md`, behavior/test markers, abstract Quality Contract gates, visual primitives, and examples. Role skills and prompts were refactored to route to that shared contract while keeping their procedural responsibilities: planning lifecycle, task decomposition, TDD discipline, review, verification, and quality reporting. Text-contract tests cover B-001 through B-020 with `@cosmo-behavior plan:artifact-format-redesign#B-###` markers, and final verification passed `bun run test`, `bun run lint`, and `bun run typecheck`.

## Key Decisions
- Canonical artifact rules live in `domains/shared/skills/work-artifacts/` rather than being duplicated across `/skill:plan`, `/skill:task`, `/skill:tdd`, or role prompts; dispatchers route to references to prevent drift and context bloat.
- Workflow ceremony is tiered: direct fixes stay lightweight with TDD/regression tests, planned feature/refactor work uses `spec.md` plus behavior-first `plan.md`, and architecture records are reserved for multi-plan or durable-boundary work.
- Behavior traceability uses stable `AC-###` and `B-###` IDs plus plain text `@cosmo-behavior plan:<slug>#B-###` test comments so the contract is language-agnostic, grepable, and enforceable later without a runtime marker API.
- `Quality Contract` is an abstract gate ladder by gate kind and binding state, not a table of concrete tools or commands; project-specific bindings and deterministic gate execution are deferred.
- Durable architecture records live under `missions/architecture/<slug>.md` and are active implementation/review context, while `memory/` remains post-completion distilled knowledge.

## Patterns Established
- Keep skill files as thin dispatchers with directly linked references; when creating or refactoring skill systems, load `/skill:creating-skills` and avoid deep reference chains.
- A full planned behavior entry must name context, action, expected result, source AC, seam, named test, and marker; a plan with behaviors lacking tests or markers is not ready for task creation.
- Task decomposition must preserve `B-###` ownership and marker expectations in task acceptance criteria so workers do not need to reconstruct the behavior spine.
- Review/verification prompts should load `work-artifacts` only when artifact conformance or plan context is in scope, and verifiers should validate explicit claims rather than expanding the scope.
- Prompt/skill tests should assert stable contract phrases and negative rules, not snapshot whole markdown files.

## Files Changed
- `domains/shared/skills/work-artifacts/SKILL.md` and `domains/shared/skills/work-artifacts/references/*.md` — new canonical shared artifact dispatcher and references for workflow tiers, artifact formats, behavior spine, gate contracts, visual primitives, and examples.
- `domains/shared/skills/architecture/SKILL.md` — new dispatcher for active architecture records and architecture usefulness rules.
- `domains/shared/skills/plan/SKILL.md`, `domains/shared/skills/task/SKILL.md`, `bundled/coding/coding/skills/tdd/SKILL.md` — refactored toward procedural ownership while routing artifact rules to `work-artifacts`.
- `bundled/coding/coding/prompts/{spec-writer,planner,task-manager,worker,plan-reviewer,reviewer,verifier,integration-verifier,quality-manager}.md` — updated producer and consumer prompt routing for tiers, behavior markers, architecture context, gate ladders, and scoped artifact review.
- `bundled/coding/coding/agents/{planner,spec-writer,task-manager,plan-reviewer}.ts` — explicit allowlists updated so artifact-producing and plan-review agents can load shared artifact skills.
- `tests/prompts/*` and `tests/agents/skills.test.ts` — text-contract coverage added/updated for all B-001 through B-020 behaviors and explicit skill availability.

## Gotchas & Lessons
- Explicit agent skill allowlists are exact filters: adding a shared skill is not enough for `plan-reviewer` or other explicit agents; their agent definitions must name the skill.
- `quality-manager` needs a separate abstract ladder contract alongside legacy `QC-*` parsing, or new gate tables can be silently treated as malformed old criteria.
- Generic artifact references must not include this repository's concrete tools or commands; even examples should avoid leaking project-specific gate bindings.
- Architecture records should not become shelfware. If a record would not change implementation or review, use a plan/task and later distill lessons into memory instead.
- The behavior marker contract is guidance and test text only for this plan; no runtime scanner, gate runner, artifact-conformance CLI, HTML renderer, or back-migration was introduced.
