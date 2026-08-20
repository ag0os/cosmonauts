# Security Review: round 1 (scoped)

## Overall

incorrect

## Assessment

The scoped knowledge-surface changes preserve the literal-true gate, proposal containment checks, and the intended authorization matrix, but the architecture-memory read path remains exploitable through workspace symlinks. An attacker-controlled repository can cause an authorized session to disclose a local secret in provider-visible context.

## Scope

- Review range: local `main..HEAD`, merge-base `a98287dda7de24a512bb0a73e8821254679fe76e`.
- `git diff --name-only main..HEAD` returned **200 changed files**.
- Relevant reviewed changed files (**37**):
  - `bundled/coding/agents/distiller.ts`
  - `bundled/coding/prompts/distiller.md`
  - `cli/session.ts`
  - `domains/shared/extensions/agent-memory/index.ts`
  - `domains/shared/extensions/architecture-memory/index.ts`
  - `domains/shared/skills/archive/SKILL.md`
  - `lib/agents/session-assembly.ts`
  - `lib/architecture-map/retrieval.ts`
  - `lib/config/index.ts`
  - `lib/config/loader.ts`
  - `lib/config/types.ts`
  - `lib/extensions/agent-memory/index.ts`
  - `lib/extensions/architecture-memory/index.ts`
  - `lib/extensions/knowledge-surface/combined-context.ts`
  - `lib/extensions/knowledge-surface/constants.ts`
  - `lib/extensions/knowledge-surface/knowledge-tools.ts`
  - `lib/extensions/knowledge-surface/session-extension.ts`
  - `lib/memory/index.ts`
  - `lib/memory/injection-budget.ts`
  - `lib/memory/knowledge-records.ts`
  - `lib/memory/knowledge-store.ts`
  - `lib/memory/multi-store-retrieval.ts`
  - `lib/memory/types.ts`
  - `lib/orchestration/definition-resolution.ts`
  - `lib/orchestration/session-factory.ts`
  - `tests/agents/session-assembly.test.ts`
  - `tests/cli/session.test.ts`
  - `tests/config/loader.test.ts`
  - `tests/domains/main-domain.test.ts`
  - `tests/episodic/pre-w3-disabled-baselines.test.ts`
  - `tests/extensions/agent-memory.test.ts`
  - `tests/extensions/architecture-memory.test.ts`
  - `tests/memory/interface.test.ts`
  - `tests/memory/markdown-store.test.ts`
  - `tests/orchestration/agent-spawner.test.ts`
  - `tests/orchestration/session-factory.security.test.ts`
  - `tests/prompts/archive-skill.test.ts`

## Findings

- id: SR-001
  dimension: injection
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "Architecture-map reads follow symlinks and disclose files outside the map root"
  files: lib/extensions/knowledge-surface/combined-context.ts, lib/extensions/architecture-memory/index.ts, lib/architecture-map/retrieval.ts
  lineRange: lib/extensions/knowledge-surface/combined-context.ts:79-91; lib/extensions/architecture-memory/index.ts:97-106; lib/architecture-map/retrieval.ts:250-271,421-424
  summary: |
    The enabled `before_agent_start` path retrieves the architecture index automatically, and the registered `architecture_map_read` tool reaches the same store. `readIndexRecord` then returns the complete bytes from `memory/architecture/index.md`, while `readMapFile` uses ordinary `readFile` with no symlink rejection, no real-path containment check, and no no-follow open.

    A malicious repository can commit `memory/architecture/index.md` as a symlink to `../../.env`. When a developer starts an architecture-authorized agent, the target file is read and placed into hidden provider-visible context; calling `architecture_map_read` also returns it. This was reproduced against the branch with a temporary project, where the record content contained the secret from the symlink target.
  suggestedFix: Confine architecture reads to regular, non-symlinked files beneath the real architecture root and use no-follow file opens for index and shard reads.
  task:
    title: "Harden architecture-map retrieval against symlink escape"
    labels: [review-fix]
    acceptanceCriteria:
      - "Index and module retrieval reject symlinked architecture roots, ancestors, and final files without reading target bytes."
      - "A regression test symlinks the index to a project secret and proves neither automatic context nor the tool result contains that secret."
