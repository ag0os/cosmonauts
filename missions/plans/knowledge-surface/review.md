# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: risk-blast-radius
  severity: high
  title: "The plan narrows ratified every-agent and path-authority guarantees around the agents that bypass them"
  plan_refs: Design §1, Risk R-003, Risk R-006, Quality Contract assertions 2-3
  code_refs: missions/plans/knowledge-surface/spec.md:34-47, missions/plans/knowledge-surface/spec.md:101-114, lib/orchestration/definition-resolution.ts:20-31, bundled/coding/agents/worker.ts:3-15, bundled/coding/agents/distiller.ts:3-10, lib/driver/backends/cli-process.ts:52-62, lib/driver/backends/codex.ts:18-29, lib/driver/backends/claude-cli.ts:16-27
  description: |
    The plan limits “every agent” to Pi `AgentDefinition` sessions and treats generic coding tools as outside the knowledge-authoring API. That conflicts with ratified INV-1/INV-2 and the letter of AC-003/AC-005, not merely an unresolved implementation interpretation. Current `coding` sessions receive `read`, `bash`, `edit`, and `write`; even `readonly` sessions receive `read`. The distiller and worker both use the coding preset. Those registered tools can read or mutate `knowledge/` without `MemoryStore`, so the proposed dedicated tools do not make either boundary enforceable.

    Drive's external Codex and Claude agents are also launched with the project root as cwd and, by default, YOLO or skipped-permission execution. Excluding them means some agents get no injected index or `recall`, while their generic filesystem tools remain a second read/write path. R-003 and R-006 cannot defer this behind a future “if intended” ruling: changing the meaning of “every agent,” “no agent tool,” or “no second retrieval path” touches ratified ground. The plan must halt and either satisfy those guarantees across generic Pi tools and external agent backends or ask the human to amend INV-1/INV-2 and AC-003/AC-005.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "D-009 is a real blocker, and AGENTS.md creates a second OFF-prompt collision"
  plan_refs: D-009, B-009, B-010, Files to Change documentation entry, Risk R-001, Implementation Order precondition
  code_refs: bundled/coding/prompts/distiller.md:1-5, bundled/coding/prompts/distiller.md:136-160, bundled/coding/agents/distiller.ts:3-10, lib/domains/prompt-assembly.ts:104-108, lib/orchestration/session-factory.ts:76-94, cli/session.ts:90-112, bundled/coding/agents/worker.ts:16-19
  description: |
    No compliant mechanism resolves D-009 as the ratified text stands. The active distiller persona mandates `memory/<planSlug>.knowledge.jsonl`, and the distiller has generic write-capable tools. A gate-selected enabled persona can preserve OFF prompt bytes, but it leaves the OFF distiller actively instructed and able to write JSONL, violating INV-3/AC-006. Retiring that instruction globally satisfies INV-3/AC-006 but violates AC-007. Blocking or altering OFF distiller execution also changes agent-visible behavior. D-009 therefore correctly requires `halt-and-escalate`; alternative A would amend AC-007 and cannot be selected by an agent.

    The plan also lists `AGENTS.md` for shipped documentation changes. Agents with `projectContext: true` keep Pi's AGENTS/CLAUDE context enabled because both session creation paths install no `agentsFilesOverride` in that case. Editing this repository's `AGENTS.md` therefore changes the effective system prompt even when the knowledge gate is OFF. That second collision is derived plan scope, not a reason to weaken AC-007: it should be removed or otherwise reconciled while D-009 remains a human decision. This finding touches ratified INV-3, AC-006, and AC-007; only the extra `AGENTS.md` scope is derived.

- id: PR-003
  dimension: lifecycle-invariant
  severity: medium
  title: "Shared extension auto-loading bypasses the central OFF gate"
  plan_refs: D-008, Design §1, Files to Change shared extension entry points, Risk R-004
  code_refs: package.json:7-10, lib/orchestration/session-factory.ts:76-91, cli/session.ts:90-107, domains/shared/extensions/architecture-memory/index.ts:70-112
  description: |
    The package advertises the whole `domains/shared/extensions` directory to Pi. The plan adds three independently loadable children there: `knowledge-surface`, `knowledge-context`, and `knowledge-proposals`. Cosmonauts-created sessions suppress package discovery with `noExtensions: true` and add selected paths, but an external Pi host loading the package bypasses `buildSessionParams` and discovers the shared extension root directly. The existing architecture extension demonstrates the factory-registration shape: tools are registered as soon as the extension loads.

    Implemented literally, an OFF external host can acquire new tools, and it may load normal/context/proposal wrappers together, creating duplicate recall/context or exposing proposal authoring outside the distiller. This is the packaging/auto-load interaction the plan does not model. Specify an entry-point placement or self-gating contract that preserves OFF identity and mutually exclusive wrappers under package discovery, and add a host-level test; central session-assembly tests alone cannot prove AC-007.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "The once-resolved gate has no contract for suppressing the two existing injectors"
  plan_refs: D-008, Design §1, Design §5, B-007, Risk R-004
  code_refs: domains/shared/extensions/agent-memory/index.ts:260-292, domains/shared/extensions/architecture-memory/index.ts:111-145, lib/agents/session-assembly.ts:96-154
  description: |
    D-008 says `buildSessionParams` resolves the gate once per assembly, while the combined-budget design requires agent-memory and architecture-memory to suppress their own hidden messages whenever that frozen decision is enabled. The current extensions independently register `before_agent_start` handlers and have no gate-state input or shared suppression signal. The plan does not define how those handlers learn the assembly-time decision.

    Reloading config independently inside each extension creates multiple authorities that can disagree after an on-disk config edit; not reloading leaves both old injectors active. Either result can produce double injection outside the 24,000-byte allocator, so the allocator's otherwise sound framing/notice accounting does not establish the combined bound. Define the exact assembly-to-extension coordination contract and its lifecycle semantics, then test the provider-visible sum after all Pi context transforms, including a config edit during a live session.

- id: PR-005
  dimension: interface-fidelity
  severity: high
  title: "The proposal write design requires fields absent from the unchanged MemoryStore draft"
  plan_refs: Design §2, Design §3, B-002, Quality Contract assertion 2
  code_refs: lib/memory/types.ts:12-23, lib/memory/types.ts:86-92
  description: |
    `MemoryStore.write` currently receives `MemoryRecordDraft`, which has no `resource`, destination, plan slug, or proposal key. The plan says this draft gains only optional provenance fields, yet the store must write a frontmatter `resource` naming the intended `knowledge/...md` destination and name files from a deterministic plan/source key. The Quality Contract additionally requires an `absolute-resource` mutation, even though D-003 says the proposal tool accepts no caller-supplied output path.

    A worker following the declared type cannot inspect or validate the resource the tests mutate, and cannot derive the stated plan key from a specified field. It must either widen the shared draft beyond “only provenance,” cast around the interface, or invent a destination algorithm. Define the exact typed draft fields and derivation rules—or remove the impossible resource mutation—and keep the dedicated tool schema, `MemoryStore.write`, proposal filename, and promotion resource aligned.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "The seed conversion can lose bundle context while still passing B-003"
  plan_refs: D-006, B-003, Design §6, Quality Contract assertion 1
  code_refs: lib/sessions/types.ts:16-44, lib/sessions/knowledge.ts:26-75, memory/memory-interface.md:1-7
  description: |
    The legacy record has `id`, `planSlug`, optional `taskId`, `sourceRole`, `type`, `content`, `files`, `tags`, and `createdAt`; its bundle also has `planTitle`, `distilledAt`, and `distilledBy`. The plan explicitly preserves `createdAt` (confirmed), source record ID, record fields, and bundle writer/time, but it does not name `planTitle`. It also does not define deterministic mappings from a JSONL record into the new required `title`, `description`, `resource`, `timestamp`, `scope`, `kind`, `writer`, `source`, and `date` fields, or state explicitly that `content` becomes the byte-preserved markdown body.

    B-003 only asks for a valid destination with “preserved legacy provenance,” so arbitrary synthesized titles/descriptions and a dropped `planTitle` can pass. AC-002's provenance-preservation letter is ratified ground. Add a complete field-by-field source-to-destination contract and assertions for every source field and normalized field; if `planTitle` is intentionally discarded, that is a provenance narrowing that needs a human ruling.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "The every-AgentDefinition test does not cover arbitrary recall owners or the real allowlist seams"
  plan_refs: B-005, D-008, Design §1, Files to Change session assembly entry, Risk R-004
  code_refs: lib/agents/session-assembly.ts:131-154, lib/orchestration/definition-resolution.ts:35-56, lib/orchestration/session-factory.ts:76-98, cli/session.ts:90-112, docs/domains.md:83-105
  description: |
    B-005 covers an installed-domain agent that “already owns `recall`,” but Design §1 special-cases only definitions that declare `agent-memory`. Installed domains may ship arbitrary Pi extensions; `buildSessionParams` sees extension names/paths, not their registered tool maps. The actual final allowlist is built only after `DefaultResourceLoader.reload()` in the CLI and spawn factories. A non-agent-memory extension that registers `recall` can therefore be replaced by or conflict with `knowledge-surface`, contrary to “existing tools are preserved” and “exactly one callable recall.”

    The named test in `tests/agents/session-assembly.test.ts` can prove path selection, but the plan does not assign integration coverage through both real loader/allowlist paths or the interactive switch path it claims. Define whether `recall` is a reserved framework tool or how arbitrary owners compose, and test callable tools after loader registration for initial CLI, switched, and spawned sessions.

- id: PR-008
  dimension: constraint-ownership
  severity: high
  title: "Backfill can close with one unreviewed record per archive despite the distiller and no-verbatim contracts"
  plan_refs: B-010, B-011, Design §7, Risk R-007, Quality Contract assertion 6, Implementation Order stages 7 and 9
  code_refs: bundled/coding/prompts/distiller.md:3-5, bundled/coding/prompts/distiller.md:84-122, .cosmonauts/config.json:1-26, AGENTS.md:55-59
  description: |
    B-010 and the current distiller contract require 3–15 records, but B-011 and Quality Contract assertion 6 accept only one proposal per slug. A faulty backfill that emits one record for every archive passes the plan. The repository config also leaves the new gate OFF, while stage 7 never specifies how the actual enabled distiller/proposal tool is invoked and then returned to the required OFF state.

    More importantly, R-007 says a human diff review is the safety boundary for INV-5, but stage 7 lets a worker generate git-tracked proposal records and close; the only no-verbatim inspection is deferred to integrated stage 9. A final checkpoint is not an owner for a ratified exfiltration constraint. Require 3–15 outputs per invocation, define the explicit gated backfill procedure, and put a human review stop/evidence contract in the backfill slice before generated proposal files can be accepted. This remediation preserves ratified INV-5; weakening the no-verbatim rule would require human escalation.

- id: PR-009
  dimension: architecture-record
  severity: low
  title: "D-004 overstates the exact proposal path as human-ratified"
  plan_refs: D-004
  code_refs: missions/architecture/knowledge-and-memory.md:404-410, missions/architecture/knowledge-and-memory.md:431-434
  description: |
    Section 11 ratifies a proposals area on the machine side under `memory/`, but its closing plan-stage list explicitly leaves the exact proposals path open. The plan's choice of `memory/agent/proposals/` is compatible with the architecture and spec, yet D-004 labels that exact path “human, ratified in §11.” Under the deviation protocol this incorrectly converts a derived plan-stage choice into ratified ground and would force unnecessary escalation later.

    Keep the path if desired, but correct the provenance to planner-proposed (or obtain an actual human ruling). D-001, D-002, and D-003 are present and retain their stated provenance; the plan frontmatter also retains `createdAt`.

## Missing Coverage

- No behavior attempts direct `knowledge/` reads/writes through Pi `read`/`bash`/`edit`/`write` or through Codex/Claude Drive backends, despite INV-1/INV-2 and AC-003/AC-005.
- No package-host test proves the new shared extension directories remain absent and mutually exclusive when Pi auto-loads `package.json`'s extension root.
- No provider-visible integration test covers final tool registration and combined hidden-message bytes across initial CLI, `/agent` switch, spawned session, and an installed extension that already registers `recall`.
- The migration test lacks a complete JSONL/meta-to-OKF field matrix, including `planTitle`, and a proof that JSONL `content` becomes the destination body.
- The backfill inventory needs a repository-derived completeness assertion so omitting the same twentieth archive from both the hand list and fixture cannot pass. All 19 listed archive plan paths were individually confirmed to exist, and all 19 corresponding `memory/<slug>.md` paths were individually confirmed absent; a project-wide directory enumeration was unavailable in this role.
- The backfill has no task-local human-review evidence before potentially sensitive proposal files become accepted tracked artifacts.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared `MemoryStore` draft/query/result signatures, session assembly and final allowlist seams, distiller contracts, and Drive backend invocation boundaries.
  findings: PR-001, PR-005, PR-007
- dimension: duplication
  status: unchecked
  checked: Structural duplication capability is unbound (`execution-not-consented`, provider `fallow`); targeted source reading found existing memory and architecture retrieval paths but cannot establish project-wide absence of duplicates.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced assembly-time extension selection against both existing per-turn injector lifecycles and config ownership.
  findings: PR-004
- dimension: risk-blast-radius
  status: checked
  checked: Traced Pi built-in tools, installed-domain extensions, packaged auto-load, Drive external backends, OFF prompts, migration, and backfill publication.
  findings: PR-001, PR-002, PR-003, PR-008
- dimension: user-experience
  status: checked
  checked: Walked enabled Pi agents, external Drive agents, OFF distiller behavior, empty surfaces, promotion, and backfill review flows.
  findings: PR-001, PR-002, PR-008
- dimension: behavior-spec
  status: checked
  checked: Reviewed all 12 behavior entries against AC-001 through AC-008, their seams, named tests, edge cases, and mutation sensitivity.
  findings: PR-001, PR-005, PR-006, PR-007, PR-008
- dimension: architecture-record
  status: unchecked
  checked: Manually checked ratified §11 and the code-structure-map boundary, but project-wide boundary capability is unbound and `memory/architecture/index.md` is missing, so full declared-boundary conformance could not be established.
  findings: PR-001, PR-009
- dimension: quality-contract
  status: checked
  checked: Reviewed the ordered abstract ladder, binding/degradation states, and plan-specific assertions against generic-tool, external-backend, OFF, migration, budget, and backfill risks.
  findings: PR-001, PR-002, PR-003, PR-005, PR-007, PR-008
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked OFF identity, JSONL retirement, proposal exits, injector suppression, extension auto-load, tracked backfill review, and recurring combined-budget behavior.
  findings: PR-002, PR-003, PR-004, PR-008
- dimension: constraint-ownership
  status: checked
  checked: Traced ratified write/read/no-verbatim constraints and session/package obligations into behaviors, tests, implementation slices, and review gates.
  findings: PR-001, PR-003, PR-007, PR-008
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors (at, not above, the guidance) and eight explicit candidate task slices.
  findings: none

## Assessment

The plan is not ready for task creation. D-009 is a genuine ratified-ground blocker, and the more fundamental issue is that the proposed AgentDefinition-only/dedicated-tool boundary does not satisfy ratified INV-1/INV-2 or AC-003/AC-005 for generic Pi tools and external agents. D-001 through D-003 and plan `createdAt` were preserved, and JSONL record `createdAt` is explicitly preserved in migration design, but the blockers and field/backfill gaps require revision and another review.
