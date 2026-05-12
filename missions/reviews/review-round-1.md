# Review Report

base: origin/main
range: 52222a62e64df62bb42f6f5474f60c63945f16fe..HEAD
round: 1

## Overall: incorrect

The Phase 1 packaging surfaces are generally well-contained and the focused tests, typecheck, and lint pass, but the actual binary compile path fails before producing an export artifact. This blocks the core `cosmonauts export --definition ... --out ...` workflow.

## Quality Contract Criteria

- QC-001 — PASS: `lib/driver/run-one-task.ts` is untouched, and the chain/Drive compaction event changes are the Pi 0.74 `auto_compaction_*` → `compaction_*` rename mapped to the same lifecycle/driver activity behavior rather than Phase 1 export integration.
- QC-005 — PASS: Claude CLI argv, prompt mode, tool preset/`allowedTools` override, cwd, temp cleanup, and auth-env handling are centralized in `lib/agent-packages/claude-cli.ts`; the runner only parses binary-runtime flags and delegates materialization.
- QC-007 — FAIL: The runner itself only materializes embedded prompt strings to temp files at runtime, but the generated compile entry imports the runner via a `file://` URL that Bun cannot resolve, so no hermetic binary is produced.
- QC-009 — PASS: `domains/shared/skills/agent-packaging/SKILL.md` guides source-agent inspection, human validation of external-safe prompts, and target-runtime tool/skill policy review.

## Findings

- id: R-001
  dimension: correctness
  severity: high
  priority: P1
  confidence: 0.98
  complexity: simple
  file:lineRange: lib/agent-packages/export.ts:47-54
  summary: The generated Bun compile entry imports `runClaudeBinary` from a `file://` URL, but `bun build --compile` does not resolve that specifier from the temp entry file. Any real export that reaches `compileAgentPackageBinary` fails before writing the binary (verified with a minimal `compileAgentPackageBinary` invocation), so the primary `cosmonauts export --definition ... --out ...` workflow is blocked even though the mocked unit test passes.
  suggestedFix: Generate a Bun-resolvable import for the runner, such as an absolute filesystem path or a copied temp-local runner entry, and add a small integration test that invokes real `bun build --compile` for a minimal package.
