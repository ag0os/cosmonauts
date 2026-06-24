# Review Report

base: main
range: 0505ef9145b7a0a6e7e7a010489aa7626775ba80..HEAD
overall: incorrect

## Overall Assessment

The branch passes the project test, lint, and typecheck commands, but the diff still has behavioral gaps in the new visibility contract. In particular, skill visibility now hides existing nested coding skills, internal deny-list typos are not validated, and the CLI named-chain path loses the information needed to report internal-chain access distinctly.

## Findings

- id: F-001
  priority: P2
  severity: medium
  confidence: 0.95
  complexity: complex
  title: "[P2] Recursive coding skills are hidden by the new visibility filter"
  files: lib/agents/skills.ts, lib/domains/loader.ts, bundled/coding/skills/languages/rails/rails-api/SKILL.md
  lineRange: lib/agents/skills.ts:157-159
  summary: The wildcard-skill path now filters Pi's discovered skills to `visibleSkillNames`, but that visible set comes from `LoadedDomain.skills`, which the loader fills only from immediate `skills/` subdirectories. In the migrated coding domain, nested skills such as `bundled/coding/skills/languages/rails/rails-api/SKILL.md` are discovered by Pi but are not in the visible set (only the top-level `languages` directory is), so coding agents with `skills: ["*"]` lose those public nested skills even though no `internal.skills` entry hides them. This also risks filtering user-provided `skillPaths` entries that are present in Pi's base catalogue but not in any domain manifest set.
  suggestedFix: Derive public skill visibility from the same recursive skill discovery metadata Pi uses, or filter by subtracting explicit internal names rather than allowlisting `LoadedDomain.skills`; preserve extra/project skill paths and add a regression for a nested coding skill.
  task:
    title: Restore recursive and extra skill visibility under internal deny-list filtering
    labels: skills, domains, regression
    acceptanceCriteria:
      1. Wildcard coding agents can see a nested public skill such as rails-api when no internal deny-list names it.
      2. Project/user skillPath skills are not removed solely because they are absent from LoadedDomain.skills.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.9
  complexity: simple
  title: "[P2] Internal deny-list entries are never validated"
  files: lib/domains/validator.ts
  lineRange: lib/domains/validator.ts:73-82
  summary: `validateDomains()` now validates leads, chain stages, and agents, but it never checks `manifest.internal` names against the domain's actual agents, skills, or chains. If an author writes `internal: { agents: ["secrt"] }` while the real agent is `secret`, validation succeeds and the real agent remains public by default, silently defeating the deny-list in exactly the typo scenario the authoring diagnostics are meant to catch.
  suggestedFix: Add validator diagnostics for each `manifest.internal` asset list when a named agent/skill/chain is absent from the loaded domain's corresponding set.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. A typo in `internal.agents`, `internal.skills`, or `internal.chains` produces an actionable validation diagnostic.
      2. Valid internal entries continue to pass validation.

- id: F-003
  priority: P2
  severity: medium
  confidence: 0.85
  complexity: simple
  title: "[P2] CLI named-chain resolution cannot report internal chains"
  files: cli/run/subcommand.ts, lib/chains/loader.ts
  lineRange: cli/run/subcommand.ts:233-236
  summary: The CLI passes `context.runtime.chains` into `resolveRunChainExpression()`, but `runtime.chains` is already a filtered `NamedChain[]`. When an outside user requests a domain chain hidden by `internal.chains`, `resolveNamedChain()` receives only that array, so `findInternalNamedChain()` cannot see the owning domain and the command reports an unknown chain (or falls back to treating the name as raw DSL) instead of the required internal-chain diagnostic.
  suggestedFix: Pass a domain-source object with the loaded domains and requester domain into named-chain resolution, or expose equivalent unfiltered chain provenance on the runtime, so hidden chains remain distinguishable from missing names.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. `cosmonauts run chain --name <internal-chain>` outside the owner domain reports an internal-chain error.
      2. Public chain listing remains filtered to visible chains only.
