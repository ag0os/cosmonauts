# Plan Review: harness-adapters

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "Project and personal scope can resolve to one owner root but use different locks"
  plan_refs: D-009, B-007, Design §6, Design §7
  code_refs: lib/skills/exporter.ts:49-57, lib/entity-file-lock.ts:25-28, lib/entity-file-lock.ts:62-72
  description: |
    D-009 says each canonical owner root has one lock/journal identity, but Design §7 names transaction siblings with both target and scope: `.cosmonauts-harness-<target>-<scope>.*`. The existing path contract resolves project scope from `projectRoot` and personal scope from `homedir()`. When a project root is the user's home directory, both scopes resolve to the same canonical `.claude` or `.agents` owner root while producing different `*-project.*` and `*-personal.*` locks/journals.

    Two invocations can then mutate the same manifest and output tree under different locks; even one request selecting both scopes has two transaction identities for one root. That defeats the serialization and recovery guarantees and can lose manifest updates. Add the aliased-root case to B-007 and make transaction identity derive from the canonical owner root (or reject the overlap). D-009 is derived ground, so this can be amended without changing the ratified ACs.

- id: PR-002
  dimension: state-sync
  severity: medium
  title: "The stable personal bundle has project-specific bytes and oscillates between projects"
  plan_refs: D-013, D-017, B-010, Design §3, Design §4
  code_refs: cli/runtime-bootstrap.ts:109-129, lib/runtime.ts:122-181, lib/chains/loader.ts:58-82, cli/skills/subcommand.ts:81-115, lib/skills/exporter.ts:49-57
  description: |
    The bundle is one stable-authority asset at the machine-global personal path, but its generated inventory is built from the current project's runtime. That runtime loads project-local domains, `.cosmonauts/config.json`, configured `skillPaths`, domain context, and project chain overrides. Project A and project B can therefore produce different desired bytes for the same `(authority:cosmonauts/core, external-skill:cosmonauts)` entry and the same `~/.claude/skills/cosmonauts` output.

    D-013 prevents this from becoming a foreign-owner conflict, but it turns every project switch into ordinary source drift: syncing B overwrites the global bundle with B's facts, after which an external agent in A sees B's inventory until A syncs again. No single target state can be current for both projects. B-010 tests relocation, not two projects with different live inventories. The plan needs an explicit cross-project freshness policy and executable outcome while preserving ratified AC-005's live-introspection requirement; weakening that criterion would require escalation.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "`--link` is exposed for commands, but no command-link shape or rejection is defined"
  plan_refs: D-002, D-007, D-008, B-005, Design §4, Design §6
  code_refs: /Users/cosmos/.claude/commands/spec-to-backlog.md:1-4, /Users/cosmos/.claude/commands/implement-plan.md:1-4, lib/skills/exporter.ts:36-57
  description: |
    The CLI's mode flag is global and can be combined with `--kind command`; D-002 also describes sticky copy/link mode for managed assets generally. The rendering contract defines only directory-skill links, flat-skill `<name>/SKILL.md` links, and generated bundle wrappers. The actual Claude command targets are single `.md` files under `~/.claude/commands/`, and neither B-005 nor Design §4 says whether command link mode creates a direct file symlink, a wrapper, or an actionable unsupported-mode error.

    A worker must invent observable behavior and provenance rules for this combination. Specify and test the command-link result or explicit rejection, including `--check` classification. Any solution must preserve ratified AC-004's Claude command path/format and byte-equivalence promise.

- id: PR-004
  dimension: constraint-ownership
  severity: medium
  title: "Ratified publication and ignore rules have no behavior owner"
  plan_refs: D-001, D-003, Design §9, Design §10, Files to Change `package.json` and `.gitignore`, Quality Contract item 7
  code_refs: package.json:14-23, .gitignore:13-21
  description: |
    `package.json` currently publishes `external-skills/` but not the new `external-commands/`, and `.gitignore` currently ignores `.claude/` but not `.agents/` or `.cosmonauts-harness-*`. The plan correctly lists both required edits and even says tests read the exact entries, but no B-### Expected/Test owns either assertion. Publication/autoload is left to a scope audit, and clean-worktree behavior is left to the closing checkpoint.

    These are load-bearing outcomes: omitting the package entry makes installed-package command sync lack its native sources; omitting the ignore entries makes default project sync dirty the repository. Final verification is too late to own implementation constraints. Carry human-ratified D-001 and D-003 into existing behavior tests (rather than dropping or changing them); changing those decisions would touch ratified ground.

- id: PR-005
  dimension: user-experience
  severity: medium
  title: "Sync can wait forever on a live but wedged owner lock"
  plan_refs: D-009, B-007, Design §6, Design §7
  code_refs: lib/entity-file-lock.ts:25-28, lib/entity-file-lock.ts:62-72, lib/entity-file-lock.ts:92-111
  description: |
    `withEntityFileLock` waits indefinitely when `waitTimeoutMs` is omitted. The plan requires every normal sync to acquire this helper but specifies no wait timeout, progress signal, cancellation result, or error/report row for contention. A live process that is stalled while holding the owner lock therefore makes `cosmonauts harness sync` hang without a bounded outcome; the extensive recovery table is never reached because stale reclamation only applies after the owner PID dies.

    B-007 covers stale phases and release uncertainty, not lock-acquisition timeout. Define the acquisition policy and its observable CLI result so a worker does not inherit the helper's indefinite default accidentally.

## Missing Coverage

- Historical revisions for the four project copies and personal bundle were not verifiable under this read-only/no-shell review; Slice C must continue to treat exact git-object lineage as evidence to establish, not an assumed pass.
- Claude/Codex loading of directory links, flat wrappers, generated wrappers, and command-file links remains unprobed. No available invocation could guarantee that project/user configuration or plugins would not execute, so this external-harness dimension is unchecked.
- Collision tests do not name case-insensitive or Unicode-normalizing filesystems, where distinct output-identity strings can resolve to one target path.
- No behavior states the safe result for a malformed provenance manifest outside a pending journal (abort all writes versus per-row conflict).
- Source-descriptor removal has an explicit forget exit for invoking project owners, but the plan does not directly test the corresponding exit for a removed stable-authority descriptor.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Existing skill target resolution, command file shape, runtime/package boundaries, chain/skill inventory inputs, and the entity-lock API were compared with the proposed contracts.
  findings: PR-001, PR-003, PR-005
- dimension: duplication
  status: unchecked
  checked: Structural duplication evidence is unavailable because the capability is unbound (`execution-not-consented`, provider `fallow`); direct reads found the existing exporter and chain-list routes but do not establish a project-wide verdict.
  findings: none
- dimension: state-sync
  status: checked
  checked: Canonical owner roots, project/personal aliasing, stable authority across projects, manifest ownership, source removal, and transaction phases were traced.
  findings: PR-001, PR-002
- dimension: risk-blast-radius
  status: checked
  checked: Machine-global bundle use, project switching, package publication, ignored outputs, command materialization, and lock contention were followed to downstream user-visible effects.
  findings: PR-002, PR-003, PR-004, PR-005
- dimension: user-experience
  status: unchecked
  checked: Static sync/check/conflict/project-switch/contention flows were walked, but external Claude/Codex link loading could not be safely live-probed without project or user configuration/plugin execution.
  findings: PR-002, PR-003, PR-005
- dimension: behavior-spec
  status: checked
  checked: B-001..B-012, AC mappings, named tests, markers, failure cases, command modes, cross-project outcomes, and task-authorable constraints were reviewed.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: architecture-record
  status: unchecked
  checked: `domains.md`, `orchestration-future.md`, `code-structure-map.md`, ROADMAP ordering, and declared dependency rules were read directly; `memory/architecture/index.md` is missing and boundary-conformance is unbound, so project-wide conformance is unchecked.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Gate ordering, binding/degradation states, negative controls, live evidence, publication/autoload checks, and clean-worktree evidence were reviewed.
  findings: PR-001, PR-004
- dimension: lifecycle-invariant
  status: checked
  checked: Lock identity, lock acquisition/release, owner-root aliases, project-switch state, manifest/journal/backup exits, and mode transitions were attacked.
  findings: PR-001, PR-002, PR-005
- dimension: constraint-ownership
  status: checked
  checked: Every Files-to-Change entry and the load-bearing Decision/Design constraints were traced to behavior tests or closing-only evidence.
  findings: PR-004
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors, three explicit slices, and a recorded split trigger; no behavior-count excess was found.
  findings: none

## Assessment

The plan remains viable but is not ready for task creation. Fix the canonical owner-root identity first: the current scope-qualified lock scheme can place two independent transactions over the same manifest and output tree.