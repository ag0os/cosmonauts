# Plan Review: project-health-audit

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The closeout design changes the ratified meaning of the branch's final commit"
  plan_refs: Decision Log D-010, B-008, Design §5, Implementation Order 11
  code_refs: scripts/update-fallow-baselines.ts:76-119, .fallow-baselines/manifest.json:1-53, docs/fallow-exceptions.md:41-51
  description: |
    D-010 says the floors are generated against a “final analyzed source commit” and then committed in a later artifact-only closeout commit. The refresh implementation makes that distinction real: it resolves `--base` to a commit, analyzes that commit in a detached worktree, and only afterward writes the generated floor and amended manifest into the caller's working tree. The commit containing those writes therefore cannot be the commit passed as `--base`.

    Ratified AC-008 and the spec's User Experience require the floors to be refreshed “at the branch's final commit.” D-010 explicitly reinterprets that wording rather than reporting an impossibility and requesting a ruling. This is ratified ground: the planner cannot substitute “final analyzed source commit” for the letter of AC-008. The contradiction must be escalated under the deviation protocol and resolved by a human ruling before task creation.

- id: PR-002
  dimension: interface-fidelity
  severity: high
  title: "The owned unused class member cannot currently satisfy both trace-before-edit and fix-all"
  plan_refs: D-006, Design §1 steps 3 and 6, Design §2, B-002, Implementation Order 1
  code_refs: lib/tasks/task-manager.ts:602-619, lib/analysis/types.ts:95-118, lib/analysis/types.ts:282-320
  description: |
    The plan owns `TaskManager.getTaskDependencyStatusSnapshot` as the sole unused class-member finding and requires an exact pre-edit trace; it also says a trace failure blocks the edit. Live Fallow 2.54.2 probes of both `getTaskDependencyStatusSnapshot` and `TaskManager.getTaskDependencyStatusSnapshot` at `lib/tasks/task-manager.ts` fail with `provider-exit` (exit 2). A file trace succeeds, but reports only the reachable file and its exported `TaskManager` class/types; it supplies no reference evidence for the member at lines 602-619.

    Using that file trace as a substitute would weaken ratified INV-003's requirement to trace reachability and references for the finding. Treating the symbol-trace failure as blocking leaves the reproduced member in place and makes ratified AC-002's zero dead-code outcome unattainable. The plan needs an explicit supported resolution or a human escalation; “narrowest file trace plus the fresh finding” does not prove the class member unused.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "The health-record contract is not complete enough to reproduce independently"
  plan_refs: D-004, D-005, D-006, Design §1 machine companion contract, B-001, B-009
  code_refs: lib/analysis/types.ts:62-78, lib/analysis/types.ts:121-273, lib/analysis/types.ts:282-320, tsconfig.json:1-17
  description: |
    The proposed public snippet references `FileDigest`, `CapabilityBindingRecord`, `InvocationRecord`, `FindingRecord`, and `EvidenceRef` without defining their fields. That omission is load-bearing: the existing analysis surface distinguishes bindings, completed results, native envelopes, unbound resolutions, and structured failures (`kind`, message, process evidence, provider details). The plan's abbreviated `CapabilityOutcome` cannot by itself show how the known duplication `invalid-output` failure, its exit-0 process evidence, diagnostic findings, and normalized dispositions are represented without collision or loss. Independent slice workers therefore do not share a complete serialization contract.

    The digest contract is also incomplete as a configuration identity. It names selected files but omits `tsconfig.json`, even though its module resolution, exclusions, and compiler settings affect TypeScript project discovery and resolution. The framing text does not state whether a SHA-256 value is framed as 64 UTF-8 hexadecimal bytes or 32 digest bytes, and clone/finding identity field encoding is not specified. Two implementations can follow the prose and produce different bytes, while a relevant configuration change can leave the declared configuration digest unchanged. Because this defeats ratified INV-005/AC-009 rather than merely reducing documentation quality, the plan needs a complete schema and canonical byte-level serialization/replay contract with one explicit owner before tasks write the record.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "Characterization requirements name scenarios but not their observable results"
  plan_refs: B-005, B-010, D-009, Design §4, Implementation Order 5-9
  code_refs: lib/memory/types.ts:103-191, lib/memory/living-memory.ts:75-1021, scripts/check-reachability.ts:139-181
  description: |
    B-005 says behavior “remains unchanged,” and the `runPass` section lists cases such as recovery failure, lock timeout, release-unconfirmed, and a committed write followed by failure, but it does not state the result variant or durable fields each case must preserve. The current boundary is concrete: lock timeout returns `kind: "failed"` with `details.recovery: "concurrent-mutation"`; unconfirmed release returns `kind: "failed"` with `recovery: "release-unconfirmed"`; failures after a committed mutation must retain `writesCommitted`. A test asserting only “failed” would satisfy the plan's current wording while missing a regression in the safety property the plan calls load-bearing.

    The other below-high critical functions receive even less: they are listed by name and told to add behavior-focused characterization, with no contexts/actions/expected outcomes for parsers, scheduler/Drive failure and cancellation paths, or the reachability visitor's import variants. Ratified INV-002 and Q-002 make characterization the risk bound, so the behavior spine must carry concrete observable outcomes (including failure/abort/recovery variants) rather than delegate their invention to isolated workers.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "Behavior-sensitive clone extractions are owned only by generic preservation prose"
  plan_refs: B-004, B-010, D-008, Design §3, Implementation Order 2-4
  code_refs: lib/agent-packages/claude-binary-runner.ts:103-136, lib/agent-packages/codex-binary-runner.ts:82-113, lib/driver/lock.ts:40-102, lib/entity-file-lock.ts:22-68
  description: |
    B-004 observes only the post-change duplication inventory, while B-010 says generally that the project stays green. The load-bearing differences are left in Design prose: binary runners must clean materialized resources once, uninstall signal handlers, preserve exit behavior, and retain variant-specific argument handling; the two lock implementations differ on timeout, stale-owner races, warnings, and release confirmation. Those are observable correctness contracts, not implementation style.

    The implementation-order stages say only to preserve variant-specific behavior or transaction semantics. A worker can remove the reported clone and pass existing tests without proving signal cleanup, exit propagation, stale-owner contention, timeout, or unconfirmed-release behavior. Carry these cases into behavior/task acceptance ownership so the mandatory 41-family extraction cannot satisfy the static outcome while regressing an untested variant.

## Missing Coverage

- A supported trace/evidence route for the currently untraceable `TaskManager` class member, or an explicit human ruling on the INV-003/AC-002 collision.
- A human decision resolving whether AC-008 means the analyzed source commit or the commit that actually contains refreshed floors and provenance.
- Fully defined JSON record member types, canonical byte encodings, and a replay/validation owner for the two committed health artifacts.
- Concrete success, failure, abort, recovery, and durable-output expectations for below-high critical functions beyond the scenario labels supplied for `runPass`.
- Behavior-focused acceptance ownership for process-runner and lock-family clone extraction edge cases.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: The baseline refresh implementation, analysis request/result/failure contracts, `TaskManager` member boundary, living-memory result boundary, and representative CLI/driver exports were compared with the plan. Live symbol and file traces were used for the class-member conflict.
  findings: PR-002, PR-003

- dimension: duplication
  status: unchecked
  checked: The supplied 87-group diagnostic inventory and the plan's 43-family ownership were reviewed, but the bound Fallow 2.54.2 duplication capability currently fails normalization with `invalid-output` despite provider exit 0 and normalized findings. Diagnostic output is not a passing capability result, so current duplicate-path completeness could not be independently certified.
  findings: none

- dimension: state-sync
  status: checked
  checked: The proposed disposition states, closeout state, baseline provenance, and `runPass` committed/recovery state ownership were checked for duplicate sources and restart fabrication.
  findings: PR-003

- dimension: risk-blast-radius
  status: checked
  checked: Baseline refresh, changed-scope audit, Drive/runner cleanup, lock behavior, living-memory recovery, persisted details, and later-slice regression paths were traced.
  findings: PR-001, PR-004, PR-005

- dimension: user-experience
  status: checked
  checked: Existing CLI editing, binary-runner exit/signal handling, Drive outcomes, and living-memory failure/recovery observations were walked from their shipped entry points.
  findings: PR-004, PR-005

- dimension: behavior-spec
  status: checked
  checked: All ten behaviors were checked for observer, shipped entry point, observable result, failure/edge coverage, and reachability to the eleven implementation slices.
  findings: PR-004

- dimension: architecture-record
  status: unchecked
  checked: `missions/architecture/living-memory.md`, `missions/architecture/tool-ecosystem.md`, staged reachability, and the stated dependency rules were read manually. Automated dependency conformance could not be checked because `analysis_status` reports `boundary-conformance` unbound with `provider-not-configured`, and the generated architecture map exposes no module shards.
  findings: none

- dimension: quality-contract
  status: checked
  checked: The plan was checked for a separate QC list, gate table, predicted binding state, and command-driven plan gates. Quality expectations are generally carried by spec-derived behaviors and named risks rather than a new quality contract.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Disposition exits, baseline refresh writes, analyzed/closeout commit transitions, configuration/result digests, same-commit replay, and `runPass` recovery/committed-write invariants were attacked against actual writes.
  findings: PR-001, PR-003

- dimension: constraint-ownership
  status: checked
  checked: Load-bearing Design and Decision Log constraints were traced to behaviors or implementation-stage ownership, including characterization order, clone semantics, no-silencing, and closeout restrictions.
  findings: PR-005

- dimension: scope-size
  status: checked
  checked: The plan has ten behavior outcomes and eleven explicit sequential slices, below the twelve-behavior guidance with dependency-order seams recorded.
  findings: none

## Assessment

The plan is viable only after substantial revision. The first issue to resolve is the ratified final-commit contradiction in D-010/AC-008; immediately after that, the planner must address the class-member trace deadlock so the first slice is actually executable without weakening INV-003.
