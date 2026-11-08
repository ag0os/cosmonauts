# Library surface

The library/content boundary is being established in library-strip steps 2–5.
The public declaration and runtime contracts will be documented as those seams land.

## Import boundary

**LS-1:** Nothing under library or CLI core imports from `domains/` or `bundled/`.
`tests/coding-agnostic-framework.test.ts` checks static imports, type imports,
re-exports, literal dynamic imports and literal `require` calls across `lib/` and
`cli/`, including content subsystems still awaiting later removal.

Extension implementations live in `lib/extensions/`, except `domain-bindings`,
whose move is deferred until its human-owned suppression registry entry can be
retired. Its implementation and directive remain unchanged at the original path.
Eight `domains/shared/extensions/*/index.ts` entry points forward to the moved
implementations to preserve
current domain and Pi discovery. Existing memory forwarding entries already
pointed into `lib/` and remain in place. Discovery and authorization defaults are
unchanged in this mechanical move; consumer runtime and memory grants follow in
later steps. The package Pi extension root remains on those forwarding entries
so internal knowledge-surface adapters are not accidentally auto-discovered.

## Agent declarations (step 3a)

`AgentDefinition` remains the single programmatic declaration. Directory loading
is an adapter into the same session assembly; consumer code can supply inline or
file instructions without a persona directory. The directory loader remains
rooted at the path its caller supplies. There is no Troupe Markdown parser or
compiler in this stretch; whether to support that file format is an open user
choice.

| Cosmonauts | Troupe | User dynamic-agents design |
| --- | --- | --- |
| `id`, `description` | Path-derived name, `description` | Definition key and descriptive metadata |
| `instructions: { kind: "inline", content }` or `{ kind: "file", path }` | Markdown body and ordered `includes` | Explicit persona source; replaces persona. File paths must be absolute; session cwd may differ from declaration root (Drive worktrees). Declaration-root resolution is deferred to step 4 |
| `resourceDomain` | Consumer declaration/include roots; no equivalent domain authority | Resource lookup scope separate from runtime identity |
| `capabilities`, `skills`, `extensions` | Includes, discoverable guides and optional same-stem extension; different shapes | Instruction packs, knowledge selection and executable providers |
| `tools`: preset or exact name array | Backend tools plus `mcp`; no exact Pi tool-list field | Presets expanded or exact names selected; providers do not expand an exact grant |
| `memory`: operation grants | No equivalent | Explicit host permissions replacing privileged agent IDs |
| `subagents` | No chain/delegation declaration | Existing named-agent delegation; creator grants remain reserved |
| `model`: provider/model string | Per-backend model object | Host/definition model settings; no rename |
| `thinkingLevel`: Pi level | Per-backend `effort`; different shape | Definition/host thinking settings; no rename |
| `projectContext`, `session`, `loop` | Backend access/mode/native settings; not equivalent | Existing execution settings retained |

File instructions require absolute paths (consumers may derive them with `fileURLToPath(new URL(..., import.meta.url))`) and are read on assembly. Session cwd is not a declaration root; relative paths are rejected. A declaration-root seam belongs to step 4. Resume/fork rebuild from
the current declaration: these are **restore-by-id** paths with accepted drift,
not restoration of an immutable configuration snapshot. No snapshot machinery,
creator-delegation schema, saved-agent UI or live provider mutation is introduced.

The library's base voice becomes consumer input rather than an implicit prompt.
This departs from `dynamic-agents.md`; the Shepherd ruled it in R8 and user acceptance remains pending in the PR; the
current content supplies its base instructions. Explicit host prompt-directory
inputs remain available for consumers that use that composition convention.

Declared instructions have identity markers stripped before the host appends its
marker. **True host binding is deferred.** The pinned Pi 1.0.3 prompt builder adds
project context after the prompt addendum, so a marker in project context can
still follow the host marker. Prompt markers are compatibility metadata, not a
trust boundary or an operating-system sandbox. Resource-domain selection must
not change delegation identity or grant internal-skill visibility.

## Memory inventory before grant migration

Memory permissions are operation groups; they do not replace project feature
gates, storage policy, human promotion, scope restrictions or retirement policy.
The inventory below records both existing modes so the migration does not lose
an implicit surface. `knowledgeSurface.enabled` is frozen at session assembly.

| Group | Existing enabled mode | Existing disabled mode | Grant migration obligation |
| --- | --- | --- | --- |
| `knowledge` | Every agent gets knowledge `recall` and the knowledge index through the session extension and combined context | No universal knowledge adapter; authored/architecture path extensions retain their legacy behavior | Default on; preserve universal recall/index when the project gate is on, allow explicit opt-out |
| `authored` | `remember` and authored `recall`, plus authored context, when the authored provider is selected and its ID check passes | Path-loaded agent-memory authorizes itself; same remember/recall pair, legacy context and record-type filtering | One grant enables both remember and authored recall; no default privileged ID; keep record/scope and gate-mode semantics |
| `proposals` | `propose_knowledge`, gated twice by the distiller identity | Not enabled | Grant registration explicitly and inject the declared writer; preserve the original consumer's writer and proposal hashes |
| `architecture` | `architecture_map_read` and architecture context when provider/ID checks pass | Path-loaded architecture-memory authorizes its fixed ID set and owns context | Grant enables the operation group; remove the library's default ID set |
| `episodes` | Tasks/plans, Drive and successful authored-memory writes capture when episodicLog is enabled | Same episodicLog gate and attribution paths | Explicit grant in the executing declaration for these paths |
| Runner-owned chain capture (independent of agent grants) | Inline and durable runners capture `chain.run` only with the explicit chain episodes flag, attributed to the normalized first declaration | Same runner capture and project gate | New consumer default false; coding content explicitly preserves capture, including verify/QM, without adding an actor grant |

Assembly currently identifies authored/architecture enablement by exact shim
paths; the on-mode composer is `lib/extensions/knowledge-surface/session-extension.ts`.
The off-mode adapters are `lib/extensions/agent-memory/index.ts` and
`lib/extensions/architecture-memory/index.ts`, reached through content forwarding
entries. Grants will replace both path selection and their self-authorizing ID
defaults. Raw providers without host authorization must fail closed.

Other code paths that access memory:

- Knowledge `recall`: `knowledge-tools.ts` combines durable knowledge with
  authorized authored records; `combined-context.ts` allocates one bounded index
  across the granted groups. Recall ownership is validated after provider load.
- Proposal writing: `knowledge-tools.ts` derives the same canonical draft through
  `deriveKnowledgeProposalIdentity`, then writes via `MemoryStore`. A writer is
  attribution, not output-path authority; closed request validation remains.
- Authored writes: `agent-memory/index.ts` preserves note/profile/playbook parsing,
  confirmation and scope rules. Its successful-write episode is separately
  subject to the episodes grant and episodicLog gate.
- Task/plan capture: `lib/extensions/episode-capture.ts` creates managers with an
  explicit episode source; task and plan transitions use that source. Direct
  manager APIs and operator CLI maintenance remain host-controlled operations.
- Drive capture: launch, frozen identity, terminal-only resume and detached runner
  paths carry the resolved worker actor/attempt. The worker's episodes grant
  must be checked; the workerAgent identity change itself belongs to step 3b.
- Operator memory/architecture CLIs perform consolidation, rejection, restoration,
  retirement and generation independently of model-facing tool grants. They do
  not silently confer those operations on an agent.

| Durable path | Group / owner |
| --- | --- |
| `<project>/knowledge/**`, user `~/.cosmonauts/knowledge/**` | knowledge reads; human promotion; operator retirement may move records to `retired/` |
| `<project>/memory/agent/{notes,playbooks}/`, `profile.md`, `profile.md.prev`, `index.md`; corresponding user memory root | authored |
| `<project>/memory/agent/proposals/**`, including `living-memory/` | proposals; operator consolidation also creates proposals |
| `<project>/memory/agent/episodes/**`, corresponding user episodes root | episodes writes; granted recall reads retain the project gate's record-type policy |
| `<project>/memory/architecture/{index.md,modules/**,graph.json}` | architecture reads; operator generation |
| `<project>/memory/agent/{consolidations,retirements}/`, `.cosmonauts/living-memory.lock` | operator maintenance/receipts, not additional model grants |
| Session/run metadata and episode actor/attempt receipts under `missions/sessions/` | host execution bookkeeping; grants do not delete or rewrite transcripts |

The original content's declarations will carry its previous grants. `knowledge`
defaults to true; other groups default to false for newly declared agents.
Library code must not name privileged content IDs. No stored memories or
knowledge are modified during the migration.

## Grant-bound execution

**LS-3:** Model-facing memory operations and episode capture are authorized and
enabled by the host-approved `AgentDefinition.memory` grants, rather than a
privileged agent name or a shim's file path. `tests/agents/declaration.test.ts`
covers arbitrary identities, both project gate modes, missing grants, knowledge
opt-out, precise tools, instruction markers and unchanged proposal derivation.
`tests/driver/episode-grants.test.ts` covers live/frozen worker capture grants.
Existing memory, task, plan and Drive assertions retain their storage and output
contracts with grants supplied by their fixtures.

The enabled mode uses one grant-selected knowledge-surface composer. The disabled
mode uses grant-bound authored/architecture factories and retains its legacy
record filtering; it does not acquire universal knowledge recall merely because
that group's default is on. Knowledge opt-out disables both the knowledge index
and knowledge recall, while authored recall remains available with its own grant.
A proposal writer must be a qualified identity under the existing storage
contract; the current content retains `coding/distiller` as its declared writer,
so its canonical proposal identities do not change. No migration rewrites stores.

A selected provider may explicitly value-export `createSessionExtension(context)`
(as a named function, variable or named re-export), where context
contains the host `agentId` and resolved memory grants. The synchronous creator returns a Pi inline factory (which may itself be async)
closed over those inputs; returning undefined means that session
registration is owned by the central memory composer. Providers without the hook
continue through Pi's ordinary path loader. Static export inspection leaves
ordinary provider evaluation to Pi, preserving one module evaluation; default,
ambient, type-only and wildcard-only exports do not opt into the hook. Directory/resolver precedence remains
intact, including a consumer provider with a native provider's name. Only selected
providers are imported during assembly; this is execution preparation, not a
catalog scan. Directory/resolver providers win; when the selected name is absent, native task/plan factories are the final tier, including resolver-only consumers without framework shims. Obsolete memory extension selections fail with grant migration guidance. Exact tool selection still constrains exposure
and a host tool-call hook blocks names outside that selection after activation
changes. Unknown executable tools fail after provider loading, before a model
request. Unsupported exact-tool agent-package export fails explicitly.

The current content supplies the former framework base as its first
`framework-base` capability. Programmatic agents have no implicit Cosmonauts base
voice. Host-provided `frameworkPromptsDir` can still supply a consumer base file;
the existing runtime overlay remains to be separated with the remaining prompt
and runtime seams. Capability/skill text alone does not grant executable tools.

Malformed id, instructions, tools, memory and resourceDomain fields produce
field-specific errors before provider/model
preparation. Empty exact tool arrays expose no executable tools; presets retain
extension-tool exposure. Enabled recall rejects missing, duplicate or foreign
owners, and an opted-out session rejects a stray recall owner. A knowledge opt-out
also excludes curated knowledge from authored recall, not only from context;
authored context refreshes after writes. Both native task and plan providers carry
the declared episode grant/source. Current content adapters fail closed if their
declaration grant is removed. These sentences are pinned by
`tests/agents/declaration.test.ts` and `tests/domains/memory-grants.test.ts`; the
CLI/spawn propagation cases are in `tests/cli/session.test.ts` and
`tests/orchestration/session-factory.security.test.ts`.

Missing Drive actors or memory declarations skip capture non-fatally and produce
bounded skip diagnostics; diagnostic detail wording is not an identity or storage
contract. The legacy review profile must not expand an exact tool grant. A saved
authored note must not create an episode without an episodes grant, even when the
project enables episodicLog. These are covered by the declaration and Drive grant
tests above.


**S3A-QUALIFIED-IDENTITY (consumer namespace rule):** Every identity segment uses `[a-z0-9][a-z0-9-]*`, validated without normalization before provider/model preparation. An id is one segment or exactly `segment/segment`. A supplied domain is one segment and requires a one-segment id; omit domain for a pre-qualified id. `{ domain: "archive", id: "writer" }` and `{ id: "archive/writer" }` yield the same marker/provider/proposal identity. Uppercase, underscores, whitespace, leading separators, empty segments and extra path levels fail loudly. Proposals use the same grammar and require a qualified identity, with no separate proposal regex. `resourceDomain` remains lookup only, never identity authority. Test: `tests/agents/declaration.test.ts`.

Pre-3a installed/ejected declarations are not granted legacy defaults: without explicit updates they lose task/plan episode capture, the implicit base voice, and formerly selected architecture context/tools. This includes ejected coding definitions outside repository content. The Shepherd proposes rejecting file-loaded declarations that omit explicit memory, and obsolete agent-memory/architecture-memory extension selections, with migration guidance. This is a user decision before merge; no silently restored defaults. Bare Pi discovery now loads task/plan defaults with no episode grant, so that path no longer captures their episodes; it is scheduled to disappear with content in step 6 unless the user chooses otherwise.

Instruction-kind validation is independent of path validity: an unknown kind with an absolute path still fails before provider/model preparation. Dumping a prompt validates the same declaration before reading its persona or writing output. Absolute file composition also works when the lower-level prompt composer receives no cwd. Tests: declaration, dump-prompt and prompt-assembly suites.

Session skill ownership and private-skill visibility follow actual declared identity, including pre-qualified ids. Resource-domain borrowing and default resource lookup do not grant identity or private visibility; domainless identity is undefined. Explicit instructions need no default resource domain. Tests: `tests/agents/declaration.test.ts`, `tests/agents/session-assembly-domain-skills.test.ts` and `tests/agents/skill-provider-inputs.test.ts`.


The proposed file migration guard requires `memory` explicitly; a capability name never substitutes for it. Loaded declarations run the full programmatic shape validator. Discovery collects errors with the agent file, domain and package/source, and active runtime validation reports `DomainValidationError`; inactive domains are filtered without halting other commands. Tests: `tests/domains/loader.test.ts`, `tests/runtime.test.ts`. The obsolete-name content test in `tests/domains/memory-grants.test.ts` imports modules directly and holds independently of this proposed guard.

The native task/plan provider tier is keyed by bare extension name, with consumer directory/resolver precedence. This departs from the provider-origin identity in `dynamic-agents.md`; origin-qualified provider identities remain a step-4 owner choice. `agent-memory` and `architecture-memory` are obsolete reserved extension selections, and are absent from the native tier. Dump-prompt domain selection for domainless declarations is deferred to step 4. DSL name detection is replaced in 3b under C7.


## Chain and Drive declarations (step 3b)

**LS-2, chain scope:** Core parsing, normalization, compilation and execution do not infer a coding actor's purpose, prompt, completion policy, terminal executor or model key. The coding consumer owns those conventions in `bundled/coding/chain-adapter.ts`, `chain-prompts.ts` and `chain-completion.ts`. Arbitrary `studio/scribe`, `studio/critic`, `studio/translator` and `studio/dispatcher` declarations exercise both runners, artifact gating and producer correlation in `tests/orchestration/chain-neutrality.test.ts`.

`NamedChain` requires exactly one of a DSL `chain` string or explicit `stages`, and accepts `episodes`. Selection looks up a named declaration first; single agent names then resolve through the declaration collection, including names with several hyphens. The parser takes no registry and returns topology only: sequence, bracket group, or fan-out. It shares declaration identity validation rather than a second agent-name grammar. Tests: `chain-parser.test.ts`, `chain-normalization.test.ts`, `chain-routing.test.ts` and CLI named-chain tests.

The consumer runtime carries `chainAdapter`, `defaultModel` and `workerAgent`. Its adapter supplies `classifyStage`, `buildStagePrompt`, `terminalGates`, optional typed refusal handling, and model/thinking defaults. Step 3b temporarily bridged domain adapter/worker hints into runtime construction. Step 4 removed that bridge: the host now supplies those runtime options explicitly, with no domain adapter selector. Session-policy metadata alone retains the separately documented inheritance rule. Stage bindings and declaration defaults are collected once; classification reads that run's registry view, and execution retains its bound reference. `chain_run` admits each selected declaration before execution using that reference and the caller's existing subagent grants. Tests: normalization cache, domain binding and orchestration authorization suites.

| Stage field | Contract |
| --- | --- |
| `stageId` | Validated unique occurrence identity; generated deterministically if omitted. Declared ids map to safe durable topology ids, and producer selectors persist that mapping. Repeated and parallel actors remain distinct. |
| `purpose` | `default`, `plan-review` or `plan-revision`; review/revision carry `targetStageIds`. Author identity is derived by the consumer. |
| `reviewTarget` | Active-plan-review selector with eligible `producerStageIds`; addressed evidence must match both that occurrence and the current review round. |
| `requiresPlanReviewTarget` | Explicit pre-spawn artifact gate, including strict preceding topology order. |
| `expectedPlanSlug` | Top-level restriction on every normalized stage. Core retains the `plan:<slug>` completion-label convention as part of its plans-tool protocol. |
| `completionPolicy` | `once` or function-bearing `state`; boolean `completionCheck` is wrapped into state and cannot conflict with an explicit policy. A public loop without a state policy is an immediate error outcome, with no implicit task-store evaluator. |
| `prompt`, `instruction` | Raw stage override and adapter-built operational instruction respectively. `User request:` retains append semantics. Terminal executors receive the raw override; both strings persist separately. |
| `terminalGate` | Consumer executor key; terminal sequential non-loop placement and key availability validate before any execution. Errors remain typed values so the coding consumer can retain its durable QM refusal artifacts. |
| `model`, `thinkingLevel` | Resolved once from stage/consumer overrides, the bound declaration and host defaults. Model/thinking maps accept open declaration keys; coding camelCase aliases live in the consumer. Missing model/default is an input error. |

All function-bearing policies, loops and completion labels route inline. The durable compiler refuses inline-only input before graph writes; callbacks and opaque terminal host context are never serialized. Budgets, deadline, abort, task-state terminal outcomes, exact report-token parsing, review freshness and same-index reviewer ambiguity remain pinned in both execution paths. Projections default missing fields and accept legacy metadata; no graph migration or legacy execution occurs, and durable chains still cannot resume. Tests: compiler, inline runner, run-start characterization, durable stats and neutral-chain suites.

Normalization failures correlate repeated display names by their supplied or generated occurrence id, preserve consumer diagnostics, and return a typed refusal before dispatch. Mixed normalized/raw input still validates the raw stages. Tests: `chain-normalization.test.ts`; declared sequential/parallel actor validation is covered in `domains/validator.test.ts`. Coding adapter contracts separately pin bound aliases, only-prior plan revision producers, model aliases and the QM host port in `domains/coding-chain-adapter.test.ts`. Consumer CLI execution without an adapter remains valid (`cli/chain-execution-neutral.test.ts`).

**Runner-owned capture:** New consumers default `episodes` to false. The coding consumer explicitly opts shipped named chains in, including verify/QM. Its adapter's `defaultEpisodes: true` translates the current anonymous DSL and project-chain behavior into an explicit per-run flag; a declaration's `episodes: false` overrides that consumer default. Attribution uses the normalized first declaration, independently of that actor's episode grant. An unresolved declaration cannot own a new episode. No agent received a new grant. Tests: neutral-chain capture cases, normalization selection cases and the existing inline/durable episode suites.

**LS-4:** Drive requires consumer `workerAgent`, with no worker spelling or domain fallback. Live and frozen execution resolution is independent of episode permission; capture still requires the selected declaration's episodes grant. A frozen actor resolves by its stored identity without live rebinding; an unavailable actor skips capture non-fatally, and subagent execution cannot substitute a different worker. Terminal-only reconciliation retains prior attempt provenance. Backend labels remain safe plain ids while execution receives the bound declaration reference. Tests: `tests/driver/declared-worker.test.ts`, episode grants, backend resolution, CLI Drive, graph resume and delegated driver suites.

**Remaining coupling, named:** LS-2 is not yet complete. Step 3c moves QM/reviewer session policy behind consumer host callbacks and replaces domain-id defaults and the domainless sentinel with declared inputs; the extended import-boundary forms are pinned by the source guard. The runtime default-model split at non-chain `session-assembly.ts`, `cli/pi-session.ts` and `cli/memory/judgment-provider.ts` belongs to step 4 under C9. Host-built runtime across launch sites, compiled provider hooks and package exports also remain step 4. No content or stored memories are deleted in this stretch.

### Step 3b review contracts

Terminal gates retain the executor's scheduler `outcome` and `nextAction`, including QM refusal (`blocked`, `wait_for_human`) and cancellation (`cancelled`). Both runners use one context builder for the raw override, stage/configured plan slugs, completion label, host context and abort signal. Tests: `quality-review-launch.test.ts` durable blocked/cancelled cases and `terminal-gate.test.ts`.

A stages-form chain reference must resolve through the registry's requested identity to the supplied resolved identity; it cannot invent a binding or widen a caller's subagent authority. The registry lookup remains snapshotted once per requested identity in a run. Tests: `chain-normalization.test.ts` forged-provider and alias cases, `orchestration-authorization.test.ts` requested-allowlist probe. Drive admission authorizes the declared worker, including a consumer `assembler` with no `worker` alias; missing worker input denies before backend execution. Test: `orchestration-driver-tool.test.ts`.

The Shepherd ruled that project-config chains retain their existing coding capture default until step 6; they gain no `episodes` field. Named programmatic declarations can override the consumer default. The Shepherd also ruled that misplaced QM stages continue writing a refusal report even beside an unknown actor. Test: `chain-runner.test.ts` mixed-error refusal.

Remaining vocabulary debt: QM/reviewer session profiles are content behind the host session-policy port after 3c; existing plan-review terminology, historical type comments and the reserved `models.default` key remain until their consuming content is removed in step 6. Non-chain fallback model inputs and their legacy exports remain assigned to step 4.

## Declared domain policy (step 3c)

Domain resource fallback and activation are separate inputs: `resourceFallback` defines the final resource tier, and `alwaysActive` participates when the consumer narrows active domains. The highest-precedence provider supplies the `alwaysActive`, `resourceFallback` and `default` flags; an omitted or false higher flag replaces a lower grant. The loader records a source-attributed warning whenever such an override drops a lower true flag, and runtime validation emits it. Same-precedence providers with a grant remain active conflicts, while a higher inactive override keeps their conflicts outside the active scope. Resource merge precedence remains unchanged. Tests: `tests/domains/declared-domain-policy.test.ts` and existing loader/runtime contracts.

Validator capability, extension and persona checks use declared resource providers. Explicit instructions remove the persona-file requirement independently of the domain's spelling; no domain name exempts an undeclared persona. Declared fallback chains participate in contextual collections, with the contextual domain winning name collisions. Effective project skills include every declared fallback provider, in discovery order. Directory-only skill callers pass `fallbackDomains` explicitly. Tests: the declared-domain-policy contracts, validator, named-chain loader and skill/session suites.

The host session-policy port supplies `SessionPolicy` and `SessionPolicyProvider` callbacks for assembly validation, tool presets/effective filtering, configuration and resource isolation, settings, transcripts, lifecycle, observation and child admission. Core session assembly, the session factory/spawner, spawn tool and interactive switch consume these hooks without importing review content or naming review actors. Coding content declares its provider through the interim manifest bridge. Test: `tests/coding-agnostic-framework.test.ts` enforces this boundary; session assembly, session-factory security, orchestration extension, QM prompt/settings and durable lifecycle suites retain the existing safeguards. Final evidence and named inherited failures are recorded in the step 3c review artifact.

Bound host policy is registered before prompting, lets the parent supply its base runtime before loading reviewed configuration, and is removed at disposal. Spawn tool arguments expose no policy/context fields. The coding host retains missing-context denial, actual bound reviewer/lens checks, override refusal, duplicate tracking, sealed prompts, transcript/evidence correlation, model identity checks, timeout integrity and delegated launcher behavior. Tests: `tests/extensions/orchestration.test.ts`, inline-compiler, spawner and session-factory security suites.

Custom domain merge strategies decide whether incoming providers are retained before activation is calculated. Their decisions are reused during resource merging; a skipped incoming flag has no activation authority. Callback decisions may therefore be needed even for a candidate that ends inactive. Default merging, same-precedence active conflicts and higher inactive overrides retain their contracts. Test: declared-domain-policy includes both directions of competing activation flags with `skip`.

Frozen Drive restoration uses the recorded fully qualified target; matching the declared worker's bare id identifies the episode category but never retargets it to another domain. A missing recorded target is skipped. The domain-strictness question is resolved by retaining this existing restore-by-id behavior, including declared alias/provider separation. Tests: `tests/driver/declared-worker.test.ts` (frozen selection and stored provider contracts).


The default resource domain comes from `DomainManifest.default`, with at most one active default; runtime loading and direct default selection reject ambiguity. Resolver-less callers supply `defaultDomain` when they need a default, rather than receiving a framework domain name. Default lead selection uses the declared default and then another eligible lead. Interactive commands resolve extension providers through the consumer resolver. Tests: declared-domain-policy, default-domain, CLI default-lead/main/no-domain-guard suites.

Domainless resource identity is `undefined` throughout session assembly, prompt and extension lookup, and skill visibility. Explicit instructions need no default-domain lookup. Directory resource fallback is the caller's `fallbackDomains` list; no undeclared directory name is invented. Borrowed resources and a default persona never grant private skill ownership; only the declared identity (including a pre-qualified id) does. Package source-agent prompts use the same instructions/resource separation. Tests: agent declaration and skill suites, domainless prompt-assembly and package-build contracts.

The LS-1 AST boundary checks `require.resolve`, `import.meta.resolve`, module-relative `new URL(..., import.meta.url)`, import-equals, absolute/file URL references and self-package or bare content roots, while retaining legitimate library domain APIs and ignoring comments/prose. Test: `tests/coding-agnostic-framework.test.ts`.


The host policy binding survives extension-loader module caches and cannot be replaced by a duplicate registration. Tests: `tests/agents/session-policy.test.ts`. Initial CLI, print/init and switched sessions carry the consumer provider and apply the selected effective tool filter; optional denial hooks remain optional. Tests: `tests/cli/host-policy-dispatch.test.ts`, `tests/cli/session.test.ts` and `tests/extensions/agent-switch.test.ts`.

Host denial remains effective when ordinary delegation would allow a target. Detached children receive sealed host parameters and preserve evidence correlation, admission cleanup, delegated results and optional-hook failure handling. Spawner registration precedes prompting, completion observations are forwarded, and explicit retention controls transcripts. Tests: `tests/extensions/spawn-policy-hooks.test.ts` and `tests/orchestration/session-policy-spawner.test.ts`.

The coding policy independently denies unbound managers, wrong callers/actual reviewers/lenses, model/thinking overrides and duplicate attempts; it validates child roles, clears append text, uses untrusted in-memory settings and forwards the exact run-local analysis consent. Tests: `tests/orchestration/host-review-policy.test.ts`, `tests/orchestration/host-review-provider.test.ts` and existing session-factory security/QM suites. Exact declaration tool lists are preserved even when a host supplies a preset. Test: `tests/agents/session-assembly.test.ts`.

Custom merge callbacks see exact resource overlap metadata and the accumulated merge/replace provenance, and same-precedence active conflicts are checked before a skip callback can hide them. Domain module evaluation order remains deterministic. Portable own providers occur once; omitted directory providers invent no paths; prompt I/O failures other than not-found propagate. Tests: `tests/domains/domain-policy-contracts.test.ts`. Source-agent package resource selection prefers its declared resource scope, then actual identity, then caller context. Test: `tests/agent-packages/build.test.ts`.


## Step 3c independent-review fixes

Session-policy selection is independent of adapter and selected-domain resolution:
one active declaring provider supplies the seal; two distinct provider objects
fail loading with `AmbiguousSessionPolicyProviderError`, and an explicit host
`sessionPolicies` choice wins. Higher domain layers that omit a seal inherit the
lower layer's provider; replacing it requires an explicit provider. Override,
multi-adapter, duplicate-provider and host-override pins:
`tests/runtime-session-policies.test.ts` (all four fail at6686111a).

The policy resource hook returns only `SessionPolicyResourceOptions`:
`appendSystemPrompt`, `agentsFilesOverride`, `additionalExtensionPaths` and
`extensionFactories`. Session creation applies those four keys explicitly; unknown
keys cannot override cwd, noExtensions, noSkills or the dedicated settings hook.
Test: `tests/orchestration/session-factory.security.test.ts`; duplicate settings
were removed from the QM resource hook, with host-review-policy coverage.

LS-2 imports are guarded across all core TypeScript files, including type and
dynamic/resolver imports. Named temporary debts are config loader/types importing
lean `SIGNAL_KINDS`/`SignalKind` (relocate in step6), and CLI main importing QM
launch/run and lean CLI content (remove in step6). The catalog's coding entry
moves from `lib/packages/catalog.ts` to the CLI host in step4. The coding tool
preset is a preset vocabulary item, recorded as debt rather than a domain default.
Test: `tests/coding-agnostic-framework.test.ts`.

Any non-fallback domain remains runnable without a lead; a default lead is only
needed by modes that actually select it. Test: `tests/cli/no-domain-guard.test.ts`.
The switch picker skips an unresolvable entry while retaining other eligible
actors and restrictions. Test: `tests/extensions/agent-switch.test.ts`.

Step4 must supply the session-policy provider explicitly from the host before3c
reaches user execution: a pre-3c installed coding package can lack any lower
provider declaration. This stale-install case is not claimed fixed by3c alone.


## Consumer runtime and public entries (step 4)

LS-5: `CosmonautsRuntime.create` accepts explicit `agents`, `chains`, `domains`,
`domainSources`, and `projectConfig`; no built-in directory is required. Explicit
`domainSources` (including `[]`) overrides source scanning. Package/domain stores
are opt-in via `discoverPackages`; directory and plugin roots are explicit inputs.
Tests: `tests/consumer-runtime.test.ts` and `tests/runtime.test.ts`.

Duplicate agent, domain and chain declarations in a runtime collection fail before
execution; this does not change `AgentRegistry.register`'s layering overwrite
contract. Qualified programmatic agents need no resource domain manifest.
Tests: `tests/consumer-runtime.test.ts`.

The current content consumer lives in `domains/host-runtime.ts`: it chooses roots,
model default, coding chain adapter, worker and session policies. Library/CLI entry
points request the host runtime through `setRuntimeHost`/`getHostRuntime`; equal
project/domain/plugin requests share construction, failed construction can retry,
and an unconfigured host fails explicitly. Explicit library session assembly and nested spawns, chains and Drive retain the supplied runtime. The current CLI mounts inline extensions with its base execution runtime, excluding interactive --domain/--plugin-dir additions, preserving pre-step4 reach. Tests: `tests/runtime-host.test.ts`, orchestration/CLI suites and extension
binding contracts. Restore-by-id continues to use the current declaration; no
snapshots are introduced.

QM's sealed base-owned review runtime is the named temporary R1 content exemption
until step 6: replacing it with the reviewed project's live runtime would weaken
its trust boundary. Lean takes the host runtime; neither is generalized.
The orchestration library's own executable asset root locates the Drive runner
and envelope code only; it is not a source of domain, agent or model defaults.

A session model resolves explicit override, declaration, then consumer default;
missing all three fails before requesting a model. The library no longer exports
a fixed fallback model. The current content consumer preserves its model choice.
Role-model/thinking compatibility helpers remain neutral utilities; they do not
infer content identities. Tests: assembly and spawner model-resolution contracts.
True host identity binding remains deferred under R8: prompt markers are display
and legacy extension authority, and project context may append later text. The
runtime host port does not itself fix that independent prompt-authority limitation.

`loadAgentDeclarations` loads default-exported TS/JS/MJS definitions from an
absolute consumer directory, validates explicit file memory policy, and ignores
hidden, declaration-only, nested and non-module files. It adds no Markdown parser.
Tests: `tests/agents/directory-loader.test.ts`.
Session extension providers may be explicit host callbacks or selected directory
hooks (`index.ts`, `index.js`, `index.mjs`, in that order); selected directory
providers retain precedence and unselected providers are not evaluated. Async hooks
receive the actual runtime, identity and grants. Test: `extension-binding.test.ts`.

LS-6: package exports enumerate all 24 stable deep entries from `fallow.toml`,
retain those exact paths, add explicit friendly aliases, a declaration/runtime root
and a runtime-host entry. The legacy `lib/lean-run/providers/default.ts` path is a named temporary content
compatibility export until step 6, pinned by the packed-package test.
There is no wildcard exposing private internals. Session
creation stays on its separate Pi-dependent public entries. Configured chain dispatch is exported from cosmonauts/chains. Test:
`tests/public-surface.test.ts`; the external package-name-only fixture is step 5. The locator is available only at cosmonauts/runtime-host as the Pi-discovery bridge, not on the declaration root.

Consumers import topology/normalization helpers from `cosmonauts/chains`; session
orchestration factories from `cosmonauts/extensions/orchestration`; and inline or
durable execution from the explicit `cosmonauts/orchestration/chain-runner` and
`cosmonauts/orchestration/durable-chain-runner` entries. These let an external
consumer bind the shipped orchestration tools and execute its declared chain
without a private deep import. Pi session execution remains on separate entries.

Memory consolidation resolves the consumer's effective model before creating the
judgment provider, so provider IDs and durable batch keys retain the actual model
(the current content's default is unchanged). Explicit models bypass host lookup;
deterministic-only consolidation does not request a runtime/model. Injected test
sessions without a model are labeled as injected rather than as a real model.
Tests: `tests/cli/memory/subcommand.test.ts` provider identity contracts.



### Domain manifest fields and host ownership

| Field | Meaning | Layering and host rule |
| --- | --- | --- |
| `id`, `description` | Resource-provider identity and description | Names have no built-in significance |
| `lead` | Agent used when a mode selects the domain lead | Optional; not a prerequisite for general runnability |
| `portable` | Allows its resources to participate in portable lookup | Independent of activation, fallback and default |
| `alwaysActive` | Participates despite an active-domain filter | Highest layer wins; dropping a lower true flag warns |
| `resourceFallback` | Final resource-lookup tier | Highest layer wins; no implicit provider name |
| `default` | Consumer-selected default resource domain/lead | At most one active default; omission drops and warns |
| `internal.agents`, `.skills`, `.chains` | Hide listed assets from outside the owning domain | Resource borrowing grants no private visibility |
| `defaultModel` | Retained domain metadata | Not an implicit runtime model default; the host supplies model policy |
| `sessionPolicies` | Optional composed policy metadata | Omission inherits; distinct providers conflict; explicit host choice wins |

Chain adapters, runtime worker and model defaults are host runtime inputs, not
manifest chain-consumer hints. Session policy remains compatibility composition
metadata while the actual current host always supplies its policy explicitly.
The internal policy port has no dedicated package export. Tests: runtime policy,
consumer-runtime and content-runtime suites.

A registered session binds its host runtime alongside the policy, shared across
extension module caches and removed on disposal; a bound spawn policy with no
runtime fails before checkout discovery. Spawn policy no longer exposes a runtime
getter. Detached child policy selection occurs once, including an absent result.
Tests: session-policy registry/spawner and spawn-policy-hooks suites.

The CLI mounts lib/extensions/agent-switch directly and resolves domain-bindings through the selected resource provider. The latter stays at domains/shared/extensions/domain-bindings until step6 and the human registry edit; real-path existence and command/resume/fork behavior are pinned. Its content catalog is
owned by `cli/package-catalog.ts`; core catalog lookup takes explicit entries and
relative sources require an explicit root. Current CLI install/update behavior
and its catalog entries remain pinned by package/update/catalog tests. The library
ships no implicit catalog content. Catalog's step4 name debt is closed; the named
step6 lean/QM import exceptions remain.

Runtime collection admission validates each supplied actor before adding its ID to
the collision collection, so an invalid duplicate reports its declaration error.
Discovered domains and configured chains also participate in collision checks;
user-store discovery requires opt-in and respects explicit user-source exclusion.
Declaration directory ordering is deterministic even with reversed enumeration,
and source-map files are ignored. Tests: consumer-runtime and directory-loader.
Package-export targets are reachability roots and missing targets are diagnosed;
test: check-reachability-visit.

Malformed default exports report the declaration-shape error. Ordinary extension
directories without a binding entry stay on the SDK discovery path without native
deprecation warnings. A known bound role is resolved through its binding even
when its original physical actor exists; frozen target lookup still bypasses
rebinding. Durable execution forwards the host runtime, resolver, policy and timeout
and excludes live runtime/policy objects from persisted graph data. Tests:
directory-loader, extension-binding, consumer-runtime and durable-chain-runner-stats.

The library also preserves diagnostic quality for invalid module exports and
omitted provider entries; native deprecation warnings are not treated as equivalent
behavior. The remaining contract-equivalent mutation cases are documented with
fresh-source evidence in the step4 review artifact.


### Review45 compatibility boundaries

Session assembly uses runtime.projectConfig before any disk fallback; the explicit
consumer configuration controls knowledgeSurface. The CLI's inline extension
scope uses the base host request (project root only), excluding its interactive
plugin directories and domain override. Those flags still govern interactive
selection, resources and agent switching. A caller available only in that added
scope cannot resolve for spawn/chain. This preserves10e4f5c0 behavior; wider reach
is a later owner choice. Tests: review45-runtime-contracts and cli/runtime-host.

Inline factories stay bound to the launch runtime after a cross-project resume;
chain/Drive still receive ctx.cwd. The runtime does not record its root and no
cross-project refusal guard is claimed (orchestration.test.ts). Configured chains
are a runtime collection: config-file edits require a new session after resetting the host, or process restart
before chain_run/lean sees them. No per-call config reread is promised.

The coding manifest carries its quality-review seal for direct runtime creation;
the content host's explicit provider still wins. Scaffold/eject outputs use public
aliases; eject rejects an unexported framework target rather than emitting a broken
specifier. Pi catalog tests bind the actual pinned1.0.3 ToolName union to the local
allowlist. Toolless Pi helpers and memory consolidate use the selected host when
choosing a default model; an explicit model bypasses that bootstrap. The CLI host
supplies its own fallback without loading framework content.

### External consumer proof (step 5)

LS-5/6/7: `tests/fixtures/library-consumer/consumer.ts` imports only the named
package's public entries and declares two qualified agents plus a stages-form
named chain. Its explicit Drive worker is `visitor/explorer`, with no `worker` alias. `tests/library-consumer.test.ts` installs a separate copy containing
only `lib/` and `package.json` (dependencies remain installed), rejects a private
import, and runs the fixture with an isolated HOME/Pi directory and blocked fetch.
No framework domains, bundled content or CLI are present in that package copy.
The same fixture runs in process so mutation coverage does not rely on child
process instrumentation.

The ordinary agent ports the shipped explorer's readonly, ephemeral, low-thinking
settings. The memory agent ports Cosmo's authored/episode grants and persistent,
high-thinking settings; the consumer supplies inline instructions instead of the
original capabilities, extensions and specialist roster. The chain ports the
shipped verify declaration's single-stage topology, assigned to the fixture
explorer; it does not implement quality review. These are intentionally small
content slices, with provenance comments in the fixture.

The proof executes a stage with an injected offline spawner and assembles actual
Pi sessions without prompting a model. The explorer exposes exactly readonly
built-ins; the memory agent exposes `recall` and `remember` without an id/path
exception. It verifies declared episode opt-in, not model output, episode capture,
persistent transcript creation or authored-memory writes. Their existing suites
retain those contracts. No live model credentials or network are needed.


Review45 fixture coverage mounts orchestration through the public extension entry,
asserts actual stage-spawn runtime identity, and normalizes its ordinary stage with
no adapter. Enabled and disabled knowledgeSurface settings come only from the
consumer runtime config; both execute in the content-free external process and in
process, pinning recall inclusion for the ordinary knowledge-granted agent.
Package exports target TypeScript ESM source: consumers need a TypeScript-capable
ESM runtime (such as Bun or a configured TypeScript loader); plain Node execution
without source support is not promised, and no engines field has been added.


### Content-independent test policies (step 6 P1)

LS-5/6/7 consumer proof now includes a synthetic adapter, named review/loop/checkpoint
chains and a session-policy provider. Classification and review targets survive
normalization; explicit state predicates complete or terminate loops; terminal gates
execute and malformed terminal declarations refuse without spawning. The external
lib-only install and in-process proof in `tests/library-consumer.test.ts` both pin
these outcomes, tool filtering and consumer delegation denial. The fixture's own
policy module imports library types only through public package exports.

Retained orchestration suites select this synthetic policy. Coding/QM prompt,
completion, transcript and audit acceptance assertions remain in adjacent
`*.content.test.ts` suites with an explicit `tests/helpers/content-chain.ts` helper;
these are content retirement homes for D2, not additional library contracts.
Generic session factory/spawner suites use `createConsumerSessionPolicy` to pin
resource overrides, creation/disposal, observed tool-result projection and child
completion timeout delivery. Runtime policy composition uses the same consumer
provider. No library policy field or package export changed in this test-only PR.


### Content-free executable and test hosts (step 6 P3)

The bin entry installs `cli/host-runtime.ts` only when a consumer host is absent.
The CLI explicitly discovers project/user packages and domain directories plus
plugin roots, loads project config and provides library orchestration. It supplies
its executable model fallback without choosing a coding adapter, session seal,
worker or framework resource root. An empty installation remains useful for list
and check commands; ordinary interaction needs a declared lead or an explicit actor.
The library still accepts leadless resource providers.

Tests: `cli/host-startup` exercises the real bin with isolated HOME, empty discovery,
the interaction guard, a leadless provider and an installed synthetic lead;
`cli/runtime-host` pins empty policy, user discovery, config and host preservation;
`cli/host-scope` pins DomainBindingTargetError refusal for a plugin-only target
through base execution scope; `cli/pi-session` and `cli/memory/subcommand` pin model helpers against
the content-free CLI factory. `cli/host-policy-dispatch` pins base extension scope alongside the selected
interactive definition/runtime and policy in init, print and interactive sessions. No live model is prompted.

The default test host owns one synthetic reader and has no worker or content
policy. Lean build/review and backend acceptance explicitly select the old host while
that content remains; direct-import content suites use the synthetic host.
Subprocess content tests generate an explicit content entry. A generic
Drive characterization instead declares the synthetic reader as its worker.
Discovered domains continue declaring their extension resource entry; the synthetic
plugin fixture forwards that entry to its host's orchestration provider. Resource
precedence and validation are unchanged.


P3 deliberately removes the bin's implicit cosmo/cody, lean build/review, QM,
shipped coding/skill export and Drive worker defaults before D1/D2 retire their
content. A coding install that relies on shared resources fails validation loudly,
including list commands (`cli/host-startup`). Explicitly adding both repository
`domains` and `bundled` roots restores resource discovery for inspection while
content remains; it does not restore the old adapter or default worker. Inline
tools keep base scope even when a plugin lead was selected interactively.
