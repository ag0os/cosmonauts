# Review Report

base: main
range: a98287dda7de24a512bb0a73e8821254679fe76e..HEAD
overall: incorrect

## Overall Assessment

The blast-radius review covered pre-existing config consumers (runtime, chains, architecture config/freshness, episodic capture, project-tools), session assembly callers (CLI initial/switch and orchestration session factory through spawner/spawn-tool), shared memory callers (markdown/episode/architecture stores and both relocated extension wrappers), and the retired session-knowledge API. The 36-markdown/10-bundle/100-record migration matches literal `main`, the default config remains keyless/OFF, and `bun run test`, `bun run lint`, and `bun run typecheck` pass. The partial slice is nevertheless incorrect because active archive guidance can recreate the retired output, the required scan evidence does not represent its named production session, architecture telemetry is incomplete, and mandatory session/OFF regression evidence is absent.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "[P1] Archive guidance still writes the retired root-memory format"
  files: domains/shared/skills/archive/SKILL.md, tests/prompts/archive-skill.test.ts
  lineRange: domains/shared/skills/archive/SKILL.md:46-102
  summary: The active archive skill still instructs the acting agent to create `memory/<slug>.md` using the legacy `source`/`plan`/`distilledAt` template before a later section says machine output belongs only under `memory/agent/proposals/`. When an archive run follows the first complete procedure, it recreates a machine-authored root distillation that the migration just retired, bypassing strict proposal provenance and human promotion; the B-009 test checks that proposal wording exists but never rejects this contradictory earlier output path.
  suggestedFix: Replace the legacy root-memory write/template with the `propose_knowledge` workflow and add a negative test that active archive guidance contains no instruction to write `memory/<slug>.md`.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Archive guidance names `memory/agent/proposals/` as the only machine-knowledge output path.
      2. B-009 fails if a root `memory/<slug>.md` write instruction or legacy template returns.

- id: F-002
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "[P1] Scan-cost pass omits the production worker architecture branch"
  files: missions/reviews/knowledge-surface-scan-cost.md, bundled/coding/agents/worker.ts, lib/agents/session-assembly.ts
  lineRange: missions/reviews/knowledge-surface-scan-cost.md:22-22
  summary: The gate artifact says its enabled `coding/worker` has no architecture authorization, but the shipped worker requests `architecture-memory` and session assembly authorizes that identity. In a project with an architecture map, a real enabled worker performs architecture config/freshness/index work on every turn while the recorded 13.955 ms p95 measures only knowledge, so this mandatory Stage-6 pass can remain green while the named production composition exceeds the threshold.
  suggestedFix: Regenerate the 20-turn evidence through `buildSessionParams` and the shipped worker definition after telemetry is complete; record every production-authorized section in the raw rows and verdict.
  task:
    title: "Measure the production-composed enabled worker"
    labels: "plan:knowledge-surface, performance, testing"
    acceptanceCriteria:
      1. The measured worker uses the authorization selected by production session assembly, including architecture retrieval.
      2. The regenerated p95 and aggregate rows include all recurring enabled-turn work before declaring `pass`.

- id: F-003
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "[P2] Architecture scan diagnostics are derived from returned records"
  files: lib/architecture-map/retrieval.ts, lib/extensions/knowledge-surface/combined-context.ts
  lineRange: lib/architecture-map/retrieval.ts:96-112
  summary: Architecture retrieval performs config loading, freshness inspection, and map reads, then reports `filesScanned` as `result.records.length` and `bytesRead` from rendered record content, which includes a synthetic freshness banner. With a current map this reports one file regardless of the source-tree freshness work and overstates disk bytes; an unknown-module lookup can read multiple shard files to enumerate modules while reporting zero. The combined handler publishes these values as per-section and aggregate scan diagnostics, so the new observable telemetry is not an honest account of the work performed.
  suggestedFix: Instrument actual architecture/freshness IO rather than deriving stats from output records, and add real-store tests for index, missing/unknown module, and multi-file freshness cases.
  task:
    title: "Make architecture retrieval telemetry reflect actual IO"
    labels: "architecture-map, memory, diagnostics"
    acceptanceCriteria:
      1. Architecture diagnostics account for recurring freshness and map-file work without counting synthetic rendered bytes as disk bytes.
      2. Combined-context aggregate tests use the real architecture store and fail if telemetry collapses to returned-record count.

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "[P2] Recall-collision tests do not cover the three session callers"
  files: tests/cli/session.test.ts, tests/orchestration/session-factory.security.test.ts, tests/orchestration/agent-spawner.test.ts, cli/session.ts, lib/orchestration/session-factory.ts
  lineRange: tests/cli/session.test.ts:132-270
  summary: The collision helper has a direct unit test, but the B-005 CLI test manufactures only one inline owner and the spawned-session test only checks factory forwarding. No initial CLI, `/agent` switch, or spawned-session test supplies an arbitrary path extension that also owns `recall`. If any caller drops its `assertEnabledRecallOwner` invocation, enabled sessions at that seam can expose ambiguous recall ownership while every current test remains green.
  suggestedFix: Add independent conflicting-owner cases through initial CLI, switch, and session-factory paths; assert failure names both owner paths and occurs before session use.
  task:
    title: "Cover recall collisions at every session assembly seam"
    labels: "plan:knowledge-surface, sessions, testing"
    acceptanceCriteria:
      1. Initial CLI, `/agent` switch, and spawn each reject inline-plus-arbitrary `recall` ownership with both paths in the diagnostic.
      2. Each caller still proves unrelated extension tools remain callable when no collision exists.

- id: F-005
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "[P2] D-023 authorization choices are bypassed by the tests"
  files: tests/agents/session-assembly.test.ts, tests/extensions/agent-memory.test.ts, tests/extensions/architecture-memory.test.ts, lib/agents/session-assembly.ts
  lineRange: tests/agents/session-assembly.test.ts:279-339
  summary: Session assembly tests execute only the synthetic ineligible row, while extension tests manually pass `authorizeAuthoredMemory` and `authorizeArchitecture` instead of consuming the booleans selected by `buildSessionParams`; the shipped-definition loop asserts only one recall. A regression such as removing `agentId === "main/cosmo"` or changing the five-agent architecture set would therefore widen or remove legacy authority in production while the D-023 tests continue to pass with hand-selected authorization values.
  suggestedFix: Execute factories returned by `buildSessionParams` for Cosmo, all five architecture consumers, and synthetic ineligible exact-wrapper users; assert registered tools separately from store/context authorization.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Every D-023 matrix row is exercised through production session assembly rather than manually supplied booleans.
      2. Tests fail on either a registration change or an authorization/store-call widening.

- id: F-006
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "[P2] Gate-transition evidence asserts labels instead of runtime behavior"
  files: tests/episodic/pre-w3-disabled-baselines.test.ts, tests/agents/session-assembly.test.ts, cli/session.ts
  lineRange: tests/episodic/pre-w3-disabled-baselines.test.ts:182-186
  summary: B-008's transition evidence only compares a JSON object containing the expected words, and the assembly test models reload/plain-new by retaining an already-returned params object rather than invoking either runtime seam. In an OFF→ON live session where a future Pi reload path accidentally rebuilds factories from edited config, the surface would turn on mid-session while these tests still pass because they never execute reload; the same gap applies in both directions and to the distinction between plain-new versus restart/reassembly.
  suggestedFix: Drive both gate directions through executable reload/plain-new and restart/`/agent` seams, asserting observable tools, context, and store construction rather than fixture labels.
  task:
    title: "Exercise the frozen and reassembled gate-transition matrix"
    labels: "plan:knowledge-surface, sessions, testing"
    acceptanceCriteria:
      1. Reload and plain-new retain the prior OFF/ON selection in both directions through the real runtime seam.
      2. Restart and `/agent` reassembly adopt both edits and prove corresponding tool/context/store effects.

- id: F-007
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] OFF prompt allowlist does not compare allowed files to current bytes"
  files: tests/episodic/pre-w3-disabled-baselines.test.ts, tests/fixtures/knowledge-surface-off-baselines.json
  lineRange: tests/episodic/pre-w3-disabled-baselines.test.ts:120-145
  summary: For each D-009-allowed file, the test hashes only `baselineContent` stored in the fixture and verifies that region markers occur in that same baseline; it never reads the current file or compares bytes outside those regions. Any unrelated change outside the declared archive/AGENTS correction ranges therefore passes, so the Quality Contract's exact prompt-correction boundary is not mutation-resistant even though non-allowlisted files are pinned correctly.
  suggestedFix: Compare each current allowed file against its baseline while masking only the declared replacement ranges, and add a negative fixture proving an out-of-range mutation fails.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Current bytes outside every declared correction range must equal the frozen baseline.
      2. A mutation immediately before or after an allowed range fails the OFF-baseline test.
