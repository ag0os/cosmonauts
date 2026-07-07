# Plan Review: memory-interface

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "Agent-memory extension lacks a user-root injection seam"
  plan_refs: plan.md:179-183, plan.md:487-492, plan.md:670-671, plan.md:794-797
  code_refs: domains/shared/extensions/architecture-memory/index.ts:51-57, tests/extensions/architecture-memory.test.ts:223-232, lib/config/types.ts:25-40
  description: |
    The plan says extension tests inject a temp `userCosmonautsRoot` so they never touch the real home directory, and the `remember` tool writes through a store constructed with `{ projectRoot: ctx.cwd, userCosmonautsRoot }`. The only explicit contract is `createMarkdownMemoryStore(options)`; the planned `domains/shared/extensions/agent-memory/index.ts` has no equivalent exported extension factory/options contract, and the existing project config shape has no memory/user-root field.

    Existing extension tests avoid hard-coded runtime dependencies through exported factories such as `createArchitectureMemoryExtension(deps)`, with tests injecting those deps directly. Without a comparable `createAgentMemoryExtension({ userCosmonautsRoot, now/storeFactory })` seam or a named config source, workers must invent how extension-level tests avoid `~/.cosmonauts`, and a literal implementation can write test artifacts into the maintainer's real home store. Specify the extension construction/test injection contract.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "Optional `remember` parameters have no deterministic OKF defaults"
  plan_refs: plan.md:172-183, plan.md:385-395, plan.md:557-589, plan.md:670-675
  code_refs: lib/architecture-map/types.ts:19-26, lib/architecture-map/generator.ts:285-290, lib/architecture-map/generator.ts:301-306, lib/architecture-map/generator.ts:358-367
  description: |
    The plan's `MemoryRecordDraft` and OKF record shape require `title`, `description`, `resource`, `tags`, and `timestamp`; the shipped architecture-map OKF constants/generator also treat these as required and always render them. But the `remember` tool contract makes `title`, `description`, `scope`, and `tags` optional while only partly describing defaults (`kind` defaults to `semantic`; scope is left to "Cosmo/tool guidance").

    B-005 tests the path where title/description are supplied, so a worker still has to invent what happens when Cosmo omits any optional field: reject the call, synthesize title/description from content, default tags to `[]`, or default scope to `project`. This can produce invalid records or inconsistent user-facing results. Make omitted-field behavior explicit and test at least the intended minimal `remember({ content })` path if it is supported.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "No-query retrieval semantics for compact indexes are unspecified"
  plan_refs: plan.md:189-202, plan.md:397-402, plan.md:591-604, plan.md:676-688
  code_refs: domains/shared/extensions/architecture-memory/index.ts:116-124, domains/shared/extensions/architecture-memory/index.ts:155-178
  description: |
    The current architecture-memory extension has an explicit no-resource path: `resource: undefined` reads the index, and `before_agent_start` uses that path to build injected context. The new general-memory extension likewise needs a way to retrieve all eligible recent notes for B-006, but `MemoryQuery.text` is merely optional and the retrieval algorithm only says "Query matching" over fields. It never states whether absent/empty `text` means "match all eligible records" or "no query/no matches".

    A worker can implement `retrieve()` as requiring query text for matches and still satisfy `recall(query)`, while compact index injection stays empty. Define the no-query/list-all behavior in the shared contract, or introduce a dedicated compact-index/list function, and tie it to B-006/B-014 tests.

- id: PR-004
  dimension: constraint-ownership
  severity: medium
  title: "Architecture delegation proof lacks an adapter spy seam"
  plan_refs: plan.md:135-151, plan.md:499-535, plan.md:609-631, plan.md:790-793
  code_refs: domains/shared/extensions/architecture-memory/index.ts:28-35, domains/shared/extensions/architecture-memory/index.ts:51-57, domains/shared/extensions/architecture-memory/index.ts:116-124, domains/shared/extensions/architecture-memory/index.ts:155-220, tests/extensions/architecture-memory.test.ts:223-232
  description: |
    B-003 requires tests to prove the extension no longer reads the architecture index through a parallel retrieval path. The current extension owns direct file reads in `readArchitectureMap()`, and its existing factory deps cover config/freshness only. The revised plan defines an architecture store factory with config/freshness deps, but it does not specify how `createArchitectureMemoryExtension()` receives a fake `MemoryStore` or adapter factory for a delegation test.

    With only real filesystem fixtures and config/freshness deps, an implementation could call the adapter and still read files directly in the extension; the tests would not necessarily fail. Give the extension a task-visible adapter injection seam, or change the acceptance proof from an executable test claim to an explicit boundary/static review owner.

## Missing Coverage

- `remember` write failure behavior for permission errors or unwritable project/user stores is not specified.
- The extension-level source for `userCosmonautsRoot` is not defined beyond the markdown store factory option.
- Compact-index retrieval does not state how many records to include before the 12,000-byte renderer truncation, or whether it uses `MemoryQuery.limit`.
- B-003's "no parallel retrieval path" proof needs either an executable adapter-spy seam or an explicit boundary-conformance owner.

## Assessment

The plan is viable with revisions. The most important fix is to make the agent-memory extension construction seam explicit so tests and production agree on the user store root and do not write to real `~/.cosmonauts` during extension tests.
