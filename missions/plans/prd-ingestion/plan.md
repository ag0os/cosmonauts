---
title: PRD Ingestion + Non-Interactive Spec-Writer Gate
status: active
createdAt: '2026-04-16T17:24:04.418Z'
updatedAt: '2026-04-16T17:24:04.418Z'
---

## Summary

Implement a strict PRD ingestion path for non-interactive spec-driven workflows so Cosmonauts can accept a written PRD, produce a `spec.md` when the PRD is complete, or refuse with a structured `gaps.md` when product requirements are missing or ambiguous. This closes the current failure mode where non-interactive spec writing proceeds on inferred assumptions and lets downstream chains continue without a trustworthy product contract.

## Scope

**In scope**
- A new CLI `--prd <path>` option for non-interactive PRD-driven runs.
- Strict PRD validation for the `spec-writer` path using a shared checklist skill.
- A plan-scoped artifact write path for `gaps.md` so the readonly `spec-writer` can refuse without broad file-write access.
- Gate behavior for workflows/chains whose first stage is `spec-writer`: stop before `planner` when gaps exist, continue only when `spec.md` exists.
- Deterministic plan-slug resolution for PRD mode and propagation of that slug into downstream plan/task execution context.
- Tests and README updates for the new flag and refusal behavior.

**Out of scope**
- Adding `--prd` support to the interactive REPL or to arbitrary agents/workflows that do not start with `spec-writer`.
- Migrating `plan-reviewer` or `integration-verifier` off raw file writes; this plan only introduces the narrower artifact path needed for PRD refusal.
- Automatic remediation of PRD gaps or an interactive follow-up questionnaire in the same non-interactive run.
- Changes to the `chain_run` tool API inside agent sessions; this plan targets the CLI entrypoint.

**Assumptions**
- Because the request did not name a specific feature, this plan picks the top prioritized roadmap item `prd-ingestion` from `ROADMAP.md:7-16`.
- PRD mode should only run in non-interactive invocations where the first executable stage is exactly `spec-writer`; parallel first steps and workflows beginning with `planner` remain unsupported.
- If `--completion-label` is provided in PRD mode, it must be `plan:<slug>` so the plan slug, task scope, and session lineage all use the same identifier.

## Design

### Module structure

**Existing modules to extend**

- `cli/main.ts` — CLI dispatch. Add `--prd` parsing/validation, run the `spec-writer` gate before the rest of a spec-driven chain, and abort early when the gate produces `gaps.md`.
- `cli/types.ts` — CLI option shape. Add a `prd?: string` field.
- `domains/shared/extensions/plans/index.ts` — focused plan artifact tool surface. Add a new tool for writing approved auxiliary artifacts inside `missions/plans/<slug>/`.
- `lib/plans/file-system.ts` — plan artifact IO. Extend the plan filesystem layer with artifact read/write helpers for allowed auxiliary markdown files.
- `bundled/coding/coding/agents/spec-writer.ts` — spec-writer definition. Keep readonly tools, add the PRD ingestion skill, and retain the plans extension.
- `bundled/coding/coding/prompts/spec-writer.md` — spec-writer behavior contract. Add a strict PRD mode that replaces “flag assumptions and continue” with “spec or gaps, never guess.”
- `README.md` — user-facing CLI documentation and examples.

**New modules**

- `cli/prd-mode.ts` — PRD-mode helper functions only. Single responsibility: read PRD input, derive/validate the plan slug, build the spec-writer prompt envelope, classify gate outcomes (`spec-ready | gaps | invalid`), and append plan-context prompts to downstream stages.
- `domains/shared/skills/prd-ingestion/SKILL.md` — shared checklist and refusal procedure used by `spec-writer` in strict PRD mode.
- `tests/cli/prd-mode.test.ts` — behavior tests for slug derivation, invalid invocation checks, and gate outcome classification.
- `tests/prompts/spec-writer.test.ts` — prompt contract tests for PRD mode.

### Dependency graph

```
cli/main.ts
  -> cli/prd-mode.ts
  -> lib/workflows/loader.ts
  -> lib/orchestration/chain-runner.ts
  -> lib/plans/file-system.ts

cli/prd-mode.ts
  -> lib/orchestration/chain-steps.ts
  -> lib/orchestration/chain-runner.ts (derivePlanSlug reuse only when needed)
  -> lib/plans/plan-manager.ts
  -> lib/plans/file-system.ts

plans extension (domains/shared/extensions/plans/index.ts)
  -> lib/plans/file-system.ts
  -> lib/plans/plan-manager.ts

spec-writer agent/prompt
  -> plans extension tools
  -> shared skill `prd-ingestion`
```

Dependency direction stays inward: the CLI/orchestration layer depends on plan/file helpers, and the prompt/skill layer depends only on the tool contract exposed by the plans extension. No domain prompt imports CLI code; the CLI injects a structured prompt envelope instead.

### Key contracts

**1. PRD prompt envelope between CLI and `spec-writer`**

`cli/prd-mode.ts` must generate a deterministic prompt block that the updated `spec-writer` prompt can detect:

```ts
interface PrdPromptEnvelope {
  mode: "prd-ingestion";
  planSlug: string;
  prdPath: string;
  prdBody: string;
}
```

Rendered form (exact headings can vary, but the keys must be stable):

```md
PRD ingestion mode
planSlug: <slug>
prdPath: <path>

--- BEGIN PRD ---
<raw PRD content>
--- END PRD ---
```

The prompt/skill contract is binary:
- complete PRD => create/update the plan directory with `spec.md`, write no `gaps.md`
- incomplete PRD => create/update the plan directory with `gaps.md`, write no `spec.md`

**2. Plan artifact tool contract**

Add a focused plans-extension tool instead of broadening `spec-writer` to full coding tools:

```ts
interface PlanWriteArtifactInput {
  slug: string;
  artifact: "gaps" | "review" | "integration-report";
  content: string;
}
```

Behavior:
- `slug` must pass `validateSlug()`.
- The plan directory must already exist.
- `artifact` maps to an allowlisted filename under `missions/plans/<slug>/`.
- Unknown artifact names are rejected.
- Writes are confined to the plan directory only.

This keeps `spec-writer` readonly while giving it exactly one additional write capability for refusal artifacts.

**3. Gate outcome classification**

`cli/prd-mode.ts` should classify the first-stage result strictly from plan artifacts:

```ts
type PrdGateOutcome =
  | { status: "spec-ready"; slug: string; specPath: string }
  | { status: "gaps"; slug: string; gapsPath: string }
  | { status: "invalid"; slug: string; reason: string };
```

Classification rules:
- `spec.md` exists and `gaps.md` does not => `spec-ready`
- `gaps.md` exists and `spec.md` does not => `gaps`
- both exist, neither exists, or plan creation failed => `invalid`

**4. Downstream plan-context prompt injection**

Because `injectUserPrompt()` only targets the first stage (`lib/orchestration/chain-steps.ts:50-68`), PRD mode must stamp the resolved plan slug onto the downstream stages that would otherwise scan all active plans. `cli/prd-mode.ts` should append targeted instructions to every remaining leaf stage, with stricter variants for:
- `planner` — use `missions/plans/<slug>/spec.md` and update only that plan
- `task-manager` — read only plan `<slug>` and pass `plan: <slug>` to `task_create`
- `tdd-planner` — enrich behaviors for tasks belonging to `plan:<slug>` only

When the user did not provide `--completion-label`, the CLI should set it to `plan:<slug>` before running the remainder of the chain so coordinator loops and session lineage are scoped consistently.

### Integration seams

- `cli/main.ts:416-451` already resolves workflows to chain steps, calls `injectUserPrompt(steps, options.prompt)`, and invokes `runChain(...)`. PRD mode must hook in here by splitting a spec-driven chain into `spec-writer gate` + `remaining stages`, not by changing the chain runner contract.
- `lib/orchestration/chain-steps.ts:50-68` injects the user prompt only into the first executable stage. This is why PRD continuation cannot rely on the original prompt to carry the plan slug into `planner` and `task-manager`; plan context must be appended explicitly to later stages.
- `bundled/coding/coding/workflows.ts:47-58` defines `spec-and-build` and `spec-and-tdd` as chains beginning with `spec-writer`, so existing workflows can be reused without new workflow names.
- `bundled/coding/coding/prompts/spec-writer.md:52-60,107` currently tells non-interactive runs to make reasonable inferences, flag assumptions, and create the plan via `plan_create`. PRD mode is an explicit exception to that default: strict checklist, no inferred product requirements, `spec.md` or `gaps.md` only.
- `bundled/coding/coding/agents/spec-writer.ts:9-11` currently exposes readonly tools, the plans extension, and skills `["pi", "plan"]`. The new design keeps the readonly toolset and adds only the new shared skill.
- `lib/agents/session-assembly.ts:174-180` prepends all shared skill names when a project skill filter exists, so adding `domains/shared/skills/prd-ingestion/SKILL.md` does not require `.cosmonauts/config.json` changes.
- `lib/plans/plan-manager.ts:61-90` plus `lib/plans/file-system.ts:18,213-235` already create and persist `spec.md`; the new artifact helper should live alongside this existing plan-file boundary rather than in CLI-specific filesystem code.
- `bundled/coding/coding/prompts/task-manager.md:9-12` instructs the task manager to discover active plans via `plan_list`/`plan_view`. Without explicit PRD plan context, multiple active plans would make the downstream stages ambiguous.

### Seams for change

- The artifact tool should allow only named plan artifacts now (`gaps`, `review`, `integration-report`), but its allowlist creates an obvious extension seam for future plan-scoped reports without reintroducing raw filesystem writes to readonly agents.
- `cli/prd-mode.ts` should keep prompt-envelope creation separate from CLI argument parsing so a future `chain_run` tool enhancement can reuse the same PRD envelope and gate classifier without copying logic.
- The checklist lives in a shared skill so future `product`-domain spec capture or PRD triage can reuse the same completeness standard.

## Approach

Use the existing spec-driven workflow path instead of inventing a new planner pipeline. The composition is:

`parse/validate --prd -> run spec-writer gate -> inspect plan artifacts -> abort on gaps OR inject plan context + continue remaining chain`

Key decisions:
- **Focused artifact write path over broader tools**: the plan extension is the correct place for plan-directory writes. This avoids granting the readonly `spec-writer` arbitrary repository write access just to create `gaps.md`.
- **CLI-level gate, not chain-runner semantics**: `runChain()` already treats one-shot stages as success/failure only; it has no artifact-aware abort hook. Splitting the first `spec-writer` stage in `cli/main.ts` is the smallest change that enforces the new refusal behavior without complicating the generic runner.
- **Single source of truth for plan slug**: derive the slug once in `cli/prd-mode.ts`, default `completionLabel` from it, and reuse it for prompt envelopes, artifact paths, remaining-stage prompts, and session lineage. This avoids desynchronization between filename-based slugs, labels, and plan directories.
- **Stable prompt contract rather than hidden runtime flags**: the `spec-writer` prompt learns PRD mode from an explicit prompt envelope, which keeps the behavior inspectable and testable.

## Files to Change

- `cli/main.ts` -- add `--prd` option handling, invocation validation, spec-writer gate execution, early-abort behavior, and remaining-chain continuation with plan context
- `cli/types.ts` -- add the parsed `prd` option
- `cli/prd-mode.ts` -- new helper for PRD file loading, slug derivation, prompt envelope generation, artifact classification, and plan-context injection
- `domains/shared/extensions/plans/index.ts` -- register `plan_write_artifact` for allowlisted plan artifacts
- `lib/plans/file-system.ts` -- add allowlisted plan artifact read/write helpers (including `gaps.md`)
- `lib/plans/index.ts` -- re-export new plan artifact helpers if needed by CLI/tests
- `bundled/coding/coding/agents/spec-writer.ts` -- add `prd-ingestion` to the skill allowlist
- `bundled/coding/coding/prompts/spec-writer.md` -- add strict PRD mode instructions and the `spec.md` vs `gaps.md` artifact contract
- `domains/shared/skills/prd-ingestion/SKILL.md` -- new PRD completeness checklist and refusal report schema
- `README.md` -- document `--prd` usage and the gap-list abort behavior
- `tests/cli/main.test.ts` -- cover `--prd` parsing and invalid combination parsing paths
- `tests/cli/prd-mode.test.ts` -- cover slug derivation, invalid invocation checks, and gate outcome classification
- `tests/extensions/plans.test.ts` -- cover `plan_write_artifact` allowlist behavior and failure cases
- `tests/plans/file-system.test.ts` -- cover auxiliary plan artifact read/write helpers
- `tests/prompts/spec-writer.test.ts` -- verify the prompt documents strict PRD mode and refusal semantics
- `tests/domains/coding-agents.test.ts` -- include `spec-writer` in invariants and verify its skill/tool contract remains readonly + plans extension

## Risks

1. **Plan slug drift across artifacts, labels, and session storage**
   - Blast radius: `missions/plans/<slug>/`, `plan:<slug>` task labels, `missions/sessions/<slug>/`, downstream archive/memory flows.
   - Classification: **Must fix**
   - Countermeasure: derive the slug once in `cli/prd-mode.ts`, reject conflicting `--completion-label` values, and default `completionLabel` to `plan:<slug>` when absent.

2. **Gap detection fails open and the chain continues on an incomplete PRD**
   - Blast radius: `planner`, `task-manager`, `coordinator`, and every implementation task created from guessed requirements.
   - Classification: **Must fix**
   - Countermeasure: run `spec-writer` as a gate stage, then classify the outcome from `spec.md`/`gaps.md` before launching any later stage. `gaps` exits nonzero immediately.

3. **Readonly `spec-writer` cannot persist refusal artifacts cleanly**
   - Blast radius: PRD-mode CLI runs; users receive a refusal message without a durable artifact to inspect or fix against.
   - Classification: **Mitigated**
   - Countermeasure: add a focused `plan_write_artifact` tool in the plans extension instead of expanding `spec-writer` to full coding tools.

4. **Downstream stages pick the wrong active plan when multiple active plans exist**
   - Blast radius: `planner` revisions to the wrong plan, task creation against the wrong slug, coordinator loops operating on unrelated work.
   - Classification: **Must fix**
   - Countermeasure: append explicit plan-context prompts to downstream stages and scope loop execution with `completionLabel`.

5. **Users invoke `--prd` in unsupported modes and get confusing partial behavior**
   - Blast radius: CLI UX for interactive runs, direct `--print` runs on non-spec-writer agents, and custom workflows without a leading `spec-writer`.
   - Classification: **Mitigated**
   - Countermeasure: fail fast with deterministic validation before any agent/session work begins.

## Quality Contract

- id: QC-001
  category: correctness
  criterion: "A complete PRD run produces `missions/plans/<slug>/spec.md`, produces no `gaps.md`, and classifies the gate result as `spec-ready`."
  verification: verifier
  command: "bun run test -- tests/cli/prd-mode.test.ts tests/plans/file-system.test.ts"

- id: QC-002
  category: behavior
  criterion: "An incomplete or ambiguous PRD run produces `missions/plans/<slug>/gaps.md`, produces no `spec.md`, and aborts before any downstream chain stage starts."
  verification: verifier
  command: "bun run test -- tests/cli/prd-mode.test.ts tests/prompts/spec-writer.test.ts"

- id: QC-003
  category: correctness
  criterion: "The new `plan_write_artifact` tool writes only allowlisted plan artifacts inside an existing plan directory and rejects unknown artifact names or missing plan slugs."
  verification: verifier
  command: "bun run test -- tests/extensions/plans.test.ts tests/plans/file-system.test.ts"

- id: QC-004
  category: integration
  criterion: "When `--prd` is used with a supported spec-driven workflow, the CLI propagates the resolved plan slug into downstream stage prompts and defaults `completionLabel` to `plan:<slug>` when the user did not supply one."
  verification: verifier
  command: "bun run test -- tests/cli/main.test.ts tests/cli/prd-mode.test.ts"

- id: QC-005
  category: behavior
  criterion: "Unsupported invocations (`--prd` in interactive mode, with non-spec-writer workflows, with non-plan completion labels, or with unreadable PRD paths) fail before any agent session or chain execution starts."
  verification: verifier
  command: "bun run test -- tests/cli/main.test.ts tests/cli/prd-mode.test.ts"

- id: QC-006
  category: architecture
  criterion: "The `spec-writer` remains on readonly tools and reaches refusal writes only through the plans extension’s allowlisted artifact tool."
  verification: reviewer

## Implementation Order

1. **Plan artifact foundation** — add allowlisted plan artifact helpers in `lib/plans/file-system.ts`, expose the new plans-extension tool, and cover it with filesystem/extension tests. This creates the safe write surface needed for `gaps.md`.
2. **Spec-writer PRD contract** — add `domains/shared/skills/prd-ingestion/SKILL.md`, update the `spec-writer` agent allowlist, and revise the prompt so PRD mode is strict and binary (`spec.md` or `gaps.md`). Add prompt/agent tests here.
3. **CLI PRD-mode helper** — create `cli/prd-mode.ts` with PRD file loading, slug derivation, invocation validation, prompt-envelope generation, downstream plan-context injection, and gate outcome classification. Add focused helper tests.
4. **CLI workflow integration** — wire `--prd` into `cli/main.ts`, split spec-driven workflows into gate + remaining stages, auto-scope `completionLabel`, and abort cleanly on gaps or invalid outcomes. Extend CLI parsing tests.
5. **User documentation** — update `README.md` with one direct `spec-writer` example and one `spec-and-build` example showing the refusal path and the generated `gaps.md` artifact.
