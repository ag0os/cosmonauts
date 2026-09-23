# Stage 2 probe record

Restores were from `cp` backups. Excluded from every count, each with its
evidence:

- `tests/cli/export/subcommand.test.ts` and `tests/cli/skills/subcommand.test.ts`
  asserted a framework root matching `/cosmonauts$/`, the checkout's directory
  name; red in any worktree not so named, green in one that is (measured at
  `f4b0789` and at branch HEAD in a scratch worktree named `cosmonauts`).
  Fixed in `fb345ad`.
- `tests/harness-adapters/inventory.test.ts` and `tests/skills/skills-cli.test.ts`
  read the gitignored `.claude/skills/`; green only with it copied in
  (measured the same way). Deleted in `fb345ad` on the human's ruling.
- `tests/driver/cross-plan-commit-lock.test.ts`: red once in the full run
  before any change on this branch, `npx vitest run` on the file alone → 1
  passed. One of the three flakes the project already records.

After `fb345ad` the unmutated suite is 3,073 of 3,073 in this worktree.

## Prose-blanking probe (B-006)

Mutation: the body of every shipped prompt, skill, capability and doc replaced
with one sentence, frontmatter kept. 129 files in round 1, 148 in round 2
(round 1's pathspec missed top-level `docs/*.md`).

| Round | At commit | Tests red | Disposition |
|---|---|---|---|
| 1 | `70b63df` | 20 | 14 prose or source-text pins deleted or loosened; 1 byte-pin removed (D-018); 5 kept |
| 2 | working tree before `282210a` | 14 | 9 prose pins deleted; 5 kept |

Kept red under blanking — structure a body legitimately carries:

| Test | Depends on |
|---|---|
| `tests/prompts/loader.test.ts` — loads runtime sub-agent template | `{{parentRole}}` template token |
| `tests/orchestration/agent-spawner.test.ts` — template loads | `{{parentRole}}` template token |
| `tests/domains/prompt-assembly.test.ts` — loads framework base/runtime | interpolated parent role |
| `tests/analysis/contracts.test.ts` — three tests | documented vocabulary tables compared with code constants |
| `tests/memory/interface.test.ts` — documents exactly the episode actions | documented action table compared with `EPISODE_ACTIONS` |

Round 1 also turned `tests/extensions/orchestration-driver-tool.test.ts`
(a driver end-to-end run) red by timeout. It did not recur in round 2, and
`npx vitest run` on the file alone after the sort → 15 passed. It is treated
as a timing flake of a real subprocess run under the load of a full suite;
it is not a survivor of the blanking, which touches no code that test runs.

## Structure-breaking probes (B-007)

| Mutant | File | Before | After `tests/skills/shipped-frontmatter.test.ts` |
|---|---|---|---|
| delete `description:` | `domains/shared/skills/plan/SKILL.md` | survived | killed |
| change the `name:` value | `bundled/coding/skills/tdd/SKILL.md` | survived | killed |
| delete the `name:` key | `bundled/coding/skills/tdd/SKILL.md` | not run | survived the first version of the test (discovery falls back to the directory name; found by review), killed after the test read the key itself |
| delete the `name:` key | `external-skills/cosmonauts/chains/SKILL.md` | not run | killed (first version did not cover `external-skills/`) |
| replace `{{objective}}` with text | `lib/prompts/framework/runtime/sub-agent.md` | killed (2 tests) | — |

## Sampled mutation probe (B-008, TASK-711)

Census at `4a6300f` by `scripts/probe-census.ts` (D-021, D-024, D-030, D-032, D-034, D-037, D-038; picks re-checked with the syntax-based declaration finder). The population is 240 test files. Excluded because they reach no shipped code: `tests/coding-agnostic-framework.test.ts`, `tests/config/biome.test.ts`, `tests/domains/shared-main-leakage.test.ts`, `tests/helpers/extension-api-mock.test.ts`, `tests/prompts/provider-neutrality.test.ts`, `tests/skills/agent-packaging.test.ts`.

| Stratum | Size | Sample | Stride |
|---|---|---|---|
| `(root)` | 4 | 3 | 1.333 |
| `agent-packages` | 9 | 3 | 3 |
| `agents` | 5 | 3 | 1.667 |
| `analysis` | 2 | 2 | 1 |
| `architecture-map` | 4 | 3 | 1.333 |
| `artifact-viewer` | 3 | 3 | 1 |
| `artifacts` | 1 | 1 | 1 |
| `chains` | 1 | 1 | 1 |
| `cli` | 48 | 5 | 9.6 |
| `config` | 2 | 2 | 1 |
| `domains` | 12 | 3 | 4 |
| `driver` | 36 | 4 | 9 |
| `durable-runtime` | 13 | 3 | 4.333 |
| `episodic` | 2 | 2 | 1 |
| `extensions` | 29 | 3 | 9.667 |
| `harness-adapters` | 5 | 3 | 1.667 |
| `helpers` | 3 | 3 | 1 |
| `init` | 1 | 1 | 1 |
| `interactive` | 1 | 1 | 1 |
| `memory` | 7 | 3 | 2.333 |
| `orchestration` | 22 | 3 | 7.333 |
| `packages` | 6 | 3 | 2 |
| `pi-contract` | 1 | 1 | 1 |
| `plans` | 3 | 3 | 1 |
| `prompts` | 1 | 1 | 1 |
| `scripts` | 7 | 3 | 2.333 |
| `sessions` | 2 | 2 | 1 |
| `skills` | 3 | 3 | 1 |
| `tasks` | 6 | 3 | 2 |
| `todo` | 1 | 1 | 1 |

The sample is 75 declarations, each the median `it`/`test` of its file. Five parallel workers probed them in throwaway worktrees of `4a6300f`, restoring with `cp`. Every row was confirmed green before mutation and green again after restore. An agent that had not written any patch then re-probed every survivor independently, in a fresh worktree of `9e93646`.

| Id | Test declaration | Mutation target | Mutant | Result | Survivor exit / note |
|---|---|---|---|---|---|
| S01 | `tests/coding-domain-rename.test.ts`: validates the coding domain after rename | `lib/domains/validator.ts:315 isCapabilityResolvable` | dropped the shared-domain capability fallback (shared?.capabilities.has(capability)) | killed |  |
| S02 | `tests/entity-file-lock.test.ts`: propagates a persistent stale-verification failure instead of spinning | `lib/entity-file-lock.ts:268 stillOwnedBy` | link() failure branch returns false for any errno code instead of rethrowing non-ENOENT errors | killed |  |
| S03 | `tests/harness-runtime-inventory.test.ts`: requires one outer composer for chain effective-skill candidate health and path rows | `lib/harness-runtime-inventory.ts:69 listHarnessPathRows` | dropped the kind tiebreak from the path-row sort (target-only comparator) | killed |  |
| S04 | `tests/agent-packages/build.test.ts`: embeds skills selected by source-agent skill mode | `lib/agent-packages/skills.ts:84 resolvePackageSkills` | source-agent branch returns every discovered skill instead of filtering to the agent's allowed names (return discovered) | survived | strengthened (`9e93646`), re-probe killed |
| S05 | `tests/agent-packages/codex-binary-runner.test.ts`: passes unknown flags through to Codex | `lib/agent-packages/codex-binary-runner.ts:214 parseArgs` | drop args starting with "--" instead of passing through | killed |  |
| S06 | `tests/agent-packages/definition.test.ts`: rejects source-agent prompts without sourceAgent and names the prompt field | `lib/agent-packages/definition.ts:84 validateAgentPackageDefinition` | dropped the prompt.kind === "source-agent" && !sourceAgent error branch (condition made false) | killed |  |
| S07 | `tests/agents/qualified-role.test.ts`: handles hyphenated roles | `lib/agents/qualified-role.ts:24 unqualifyRole` | separator index found with /[\/-][^\/-]*$/ (treats '-' as a domain separator) instead of lastIndexOf('/') | killed |  |
| S08 | `tests/agents/resolver.test.ts`: returns true for registered ID | `lib/agents/resolver.ts:123 AgentRegistry.has` | resolveId(...) !== undefined flipped to === undefined | killed |  |
| S09 | `tests/agents/session-assembly.test.ts`: returns only extra paths when agent has no extensions | `lib/agents/session-assembly.ts:202 buildSessionParams` | extra extension paths dropped: `? [...retainedResolvedPaths, ...extraExtensionPaths]` -> `? [...retainedResolvedPaths]` | killed |  |
| S10 | `tests/analysis/binding-resolver.test.ts`: resolves every trace target against provider identity requirements | `lib/analysis/binding-resolver.ts:124 missingTraceTargetIdentity` | duplicate-location identity check tests location.column instead of location.line | killed |  |
| S11 | `tests/analysis/contracts.test.ts`: discriminates result verdicts and failed bindings | `lib/analysis/types.ts:74 AnalysisVerdict` | widened AnalysisVerdict to "pass" \| "fail" \| "not-applicable" | survived | type-only declaration: vitest stays green on the mutant, and `bun run typecheck` goes red (TS2344 at contracts.test.ts:49, inside the declaration). Killed by the project type-check step |
| S12 | `tests/architecture-map/analyzer.test.ts`: records public interfaces internal dependencies and external imports | `lib/architecture-map/analyzer.ts:402 recordDependencySpecifier` | internal dependency recorded only for relative specifiers (path-alias import @shared/models no longer counted as internal) | killed |  |
| S13 | `tests/architecture-map/config.test.ts`: ignores architecture map roots that escape the project root | `lib/architecture-map/config.ts:260 validateSafeRelativePaths` | containment check uses the unresolved path instead of the realpath (symlink escape not followed) | killed |  |
| S14 | `tests/architecture-map/freshness.test.ts`: reports stale when analyzer configuration changes but unrelated project config changes stay current | `lib/architecture-map/freshness.ts:120 createProjectSnapshot` | analyzer config file contents no longer hashed (only its path) | killed |  |
| S15 | `tests/artifact-viewer/loaders.test.ts`: validates slugs and architecture resources before loading artifacts | `lib/artifact-viewer/loaders.ts:120 loadReviewArtifact` | dropped validateMarkdownFilename call before reading missions/reviews/<filename> | killed |  |
| S16 | `tests/artifact-viewer/render.test.ts`: renders inline links in the supported subset with escaped href and label | `lib/artifact-viewer/renderer.ts:204 renderInlineLinks` | removed escapeHtml() around safeHref in the <a href="..."> template | survived | strengthened, re-probe killed |
| S17 | `tests/artifact-viewer/server.test.ts`: serves plan pages with read only task status and empty states | `lib/artifact-viewer/loaders.ts:179 loadPlanTaskStatus` | TaskManager.listTasks (initializing, writes missions/tasks/config.json) instead of listTasksReadOnly | killed |  |
| S18 | `tests/artifacts/plan-conformance.test.ts`: masks Markdown code spans and fences before decision declaration and citation scans | `lib/artifacts/markdown-scan.ts:50 isFenceClosingLine` | dropped run.length >= fence.length (shorter inner fence closes a longer outer fence) | killed |  |
| S19 | `tests/chains/named-chain-loader.test.ts`: resolves project-defined chain | `lib/chains/loader.ts:81 loadNamedChains` | project-config chain guard flipped: typeof def.chain === "string" -> !== | killed |  |
| S20 | `tests/cli/architecture/main-dispatch.test.ts`: routes cosmonauts architecture generate to createArchitectureProgram | `cli/main.ts:723 top-level subcommand dispatch` | dropped subcommand === "architecture" from the subcommand-program branch (falls through to default run path) | killed |  |
| S21 | `tests/cli/dump-prompt.test.ts`: default routing coding domain uses coding/cody when no agent is provided | `lib/agents/resolve-default-lead.ts:33 resolveDefaultLead` | domain-lead branch guarded by `domainContext && options.agent`, so -d without -a falls through to the main lead | killed |  |
| S22 | `tests/cli/pi-flags.test.ts`: accumulates repeated theme flags | `cli/pi-flags.ts:254 consumeEnabledStringArrayFlag` | start from an empty array instead of the previously accumulated values (last --theme wins) | killed |  |
| S23 | `tests/cli/resolve-default-lead.test.ts`: default routing main installed returns main/cosmo when coding is installed | `lib/agents/resolve-default-lead.ts:43 resolveDefaultLead` | main-lead preference branch disabled (falls through to first non-main domain lead) | killed |  |
| S24 | `tests/cli/skills/subcommand.test.ts`: registers list and export subcommands | `cli/skills/subcommand.ts:182 createSkillsProgram` | list command name and alias swapped (.command("ls").alias("list")) | killed |  |
| S25 | `tests/config/loader.test.ts`: filters non-string values from skills array | `lib/config/loader.ts:151 skills parsing in loadProjectConfig` | skills filter predicate s != null instead of typeof s === "string" (keeps 42) | killed |  |
| S26 | `tests/config/scaffold.test.ts`: is idempotent — second call returns false | `lib/config/loader.ts:455 scaffoldProjectConfig` | already-exists branch returns true instead of false (row's via lib/chains/loader.ts is not the unit under test) | killed |  |
| S27 | `tests/domains/agent-models.test.ts`: resolve against Pi's built-in model catalog | `bundled/coding/agents/verifier.ts:8 verifier definition (resolved by lib/orchestration/model-resolution.ts resolveModel)` | typo in a shipped agent model id: openai-codex/gpt-5.6-sol -> openai-codex/gpt-5.6-soI | killed |  |
| S28 | `tests/domains/default-domain.test.ts`: returns an explicit domain without consulting the fallback | `lib/domains/default-domain.ts:37 resolveDefaultDomain` | explicit-domain early return moved after the resolver main-installed check | killed |  |
| S29 | `tests/domains/public-surface.test.ts`: exposes every discovered asset type when manifest.internal is omitted | `lib/domains/public-surface.ts:19 isInternalSurfaceName` | missing manifest.internal treated as internal: `?? false` -> `?? true` | killed |  |
| S30 | `tests/driver/backends/claude-cli.test.ts`: run includes configured args before print mode | `lib/driver/backends/claude-cli.ts:31 createClaudeCliBackend run argv` | argv order swapped to [binary, "-p", ...args] | killed |  |
| S31 | `tests/driver/default-envelope.test.ts`: missing framework default names the path and tells callers to pass an explicit envelope | `lib/driver/default-envelope.ts:30 resolveDefaultDriveEnvelopePath` | error message names frameworkRoot instead of the full envelope path | killed |  |
| S32 | `tests/driver/driver-durable-dual-write.test.ts`: continues the drive run when normalized event append fails | `lib/driver/event-stream.ts:380 appendDurableEvents` | rethrow the append error after reporting the diagnostic (drops the fail-soft) | killed |  |
| S33 | `tests/driver/lock.test.ts`: driver repo commit lock atomic acquisition serializes waiters and releases | `lib/driver/lock.ts:99 acquireRepoCommitLock` | !isProcessAlive(existing.pid) flipped, so a live holder's lock is broken as stale | killed |  |
| S34 | `tests/durable-runtime/backend-contracts.test.ts`: defines generic backend and attempt contracts without Drive dependencies | `lib/durable-runtime/backends.ts:1 (module imports)` | backend contract gains a Drive dependency: `import type { StateCommitPolicy } from "../driver/types.ts"` + optional commitPolicy field | killed |  |
| S35 | `tests/durable-runtime/run-start-resume.test.ts`: repairs zero initial step records when the persisted graph matches | `lib/durable-runtime/run-start.ts:294 initializeRun (matching-graph branch)` | existing run with matching graph skips seedMissingStepRecords and uses persistedSteps as-is | killed |  |
| S36 | `tests/durable-runtime/scheduler-heartbeats.test.ts`: keeps long idle running steps alive while heartbeats remain fresh and no hard timeout is configured | `lib/durable-runtime/scheduler.ts:714 renewPersistedRunningStep` | renewal reuses the stale timestamp: renewedAt = step.heartbeat?.at ?? now() | killed |  |
| S37 | `tests/episodic/pre-w3-disabled-baselines.test.ts`: drives restart reassembly and the shipped agent command to adopt both gate edits | `cli/session.ts:589 createSession createRuntime (agent-switch branch)` | agent-switch path builds resource-loader options from the stale startup params instead of the freshly rebuilt newParams | killed |  |
| S38 | `tests/episodic/w3-contract.test.ts`: rescans the complete enabled vocabulary across isolated project and user stores | `lib/memory/markdown-store.ts:501 retrieveMarkdownRecords` | episode records only scanned for the project scope (user-store episodes skipped) | killed |  |
| S39 | `tests/extensions/agent-memory.test.ts`: remember supports deterministic minimal content saves | `lib/extensions/agent-memory/index.ts:1237 defaultTitleFromContent` | title truncation off by one: slice(0, 60) -> slice(0, 61) | killed |  |
| S40 | `tests/extensions/orchestration-driver-bus-isolation.test.ts`: spawn_activity does not invoke the driver_activity subscriber | `domains/shared/extensions/orchestration/index.ts:194 driver_activity subscription` | driver-activity subscriber registered on "spawn_activity" (copy-paste type) | killed |  |
| S41 | `tests/extensions/orchestration-watch-events-normalized-compat.test.ts`: preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics | `lib/driver/watch-events-compat.ts:131 cursorForLegacyCount` | cursor always returns total (drops the since >= total ? since branch) | killed |  |
| S42 | `tests/harness-adapters/inventory.test.ts`: keeps playwright-cli only as the permanent foreign conflict | `lib/harness-adapters/sync.ts:3603 classify row (unclaimed present target)` | unclaimed existing target classified as current/current instead of locally-edited/foreign-or-untraceable | survived | compares test-local constants with copies of themselves and reaches no production code, so it is **deleted** (`9e93646`) |
| S43 | `tests/harness-adapters/provenance.test.ts`: classifies the complete owner source target mode and concurrent-read grid without writing | `lib/harness-adapters/sync.ts:499 (unrecorded-entry classification)` | dropped `\|\| targetState !== "absent"`, so a pre-existing unmanaged target is classified missing | killed |  |
| S44 | `tests/harness-adapters/render.test.ts`: materializes sticky copy direct-link flat and generated-wrapper shapes safely | `lib/harness-adapters/render.ts:294 findLineEnd (via renderIdentityMarkdown/frontmatterEndOffset)` | CRLF not stripped: contentEnd = lf, so CRLF frontmatter is missed and the marker lands at byte 0 | killed |  |
| S45 | `tests/helpers/domain-package-fixture.test.ts`: loads a synthetic installable domain package through the package scanner | `lib/packages/scanner.ts:163 addPackageSources` | root domain (path ".") no longer skipped when collecting parent dirs, so it also emits a domains-dir source for the package | killed | red through a `DomainIdConflictError` that the mutant causes in the loader |
| S46 | `tests/helpers/fixtures.test.ts`: creates plan fixtures with overrides | `lib/plans/plan-manager.ts:106 PlanManager.createPlan` | spec.md write skipped (if (input.spec && false)) | survived | strengthened, re-probe killed |
| S47 | `tests/helpers/packages.test.ts`: writes and loads a project-installed package through scanner and loader seams | `lib/packages/scanner.ts:200 addPackageSources` | root-domain (path '.') package emitted without sourceType 'domain-root' (plain domains-dir source) | killed |  |
| S48 | `tests/init/prompt.test.ts`: includes the working directory | `lib/init/prompt.ts:12 buildInitBootstrapPrompt` | cwd interpolation replaced by the literal 'the current project' | killed |  |
| S49 | `tests/interactive/agent-switch.test.ts`: clears the slot after consuming | `lib/interactive/agent-switch.ts:27 consumePendingSwitch` | slot not cleared on consume (dropped `globals[SWITCH_KEY] = undefined`) | killed |  |
| S50 | `tests/memory/consolidation-sources.test.ts`: declines aggregate corpus overflow inside the shared knowledge reader | `lib/memory/knowledge-store.ts:193 retrieve byte-limit scan (remainingBytes)` | shared reader's remainingBytes ignores tally.bodyBytesAdmitted (aggregate ceiling never shrinks) | killed |  |
| S51 | `tests/memory/interface.test.ts`: exposes W1 taxonomy and honest write outcomes without speculative consolidation variants | `lib/memory/markdown-store.ts:456 failedWrite` | failure reason drops the underlying filesystem error message (': ${reason}' removed) | survived | strengthened, re-probe killed; the strengthened assertion expects the errno `ENOTDIR` or `EEXIST` (observed on macOS; not reproduced on Linux) |
| S52 | `tests/memory/living-memory.test.ts`: does not clobber a concurrently recreated episode during finalize restore | `lib/memory/durable-files.ts:246 durableRestore` | restore via rename (clobbers the destination) instead of link (fails EEXIST) | killed |  |
| S53 | `tests/orchestration/activity-bus.test.ts`: runSessionCleanup invokes and removes the registered callback | `lib/orchestration/activity-bus.ts:34 runSessionCleanup` | removed sessionCleanup.delete(sessionId) before invoking | killed |  |
| S54 | `tests/orchestration/chain-event-adapter.test.ts`: maps durable chain spawn evidence to ChainEvents and refuses to fabricate missing session ids | `lib/orchestration/chain-event-adapter.ts:588 validateChainAgentEvidence` | missing sessionId no longer rejected; falls back to event.sessionId (fabrication) | killed |  |
| S55 | `tests/orchestration/message-bus.test.ts`: unsubscribing one token does not affect other subscribers | `lib/orchestration/message-bus.ts:120 MessageBus.unsubscribe` | unsubscribe removes every handler sharing the token's event type | killed |  |
| S56 | `tests/packages/catalog.test.ts`: every entry has name, description, and source fields | `lib/packages/catalog.ts:28 BUNDLED_CATALOG` | coding entry description set to "" | killed |  |
| S57 | `tests/packages/installer.test.ts`: rejects a root-domain package missing root domain.ts before writing to the store | `lib/packages/installer.ts:283 assertRootDomainPackageSemantics` | missing-`domain.ts` stat error swallowed (catch returns instead of falling through to the throw) | killed | corrected pick (D-038): the line regex missed a multiline `test.each` and first sampled line 309 ("rejects path dot when another domain is declared…"). That probe survived an off-by-one in `hasNonExclusiveRootDomain`, was strengthened (`9e93646`) and re-probed to killed; it stays as an unsampled improvement. The true median, line 285, killed its mutant ("promise resolved … instead of rejecting") |
| S58 | `tests/packages/scanner.test.ts`: full ordering: built-in → bundled → global → local → plugin | `lib/packages/scanner.ts:73,92 scanDomainSources` | swapped global (1) and local (2) precedence values | killed |  |
| S59 | `tests/pi-contract/pi-behavior-contract.test.ts`: one sequential tool serializes the entire batch | `lib/extensions/agent-memory/index.ts:238 remember tool definition (production dependent of the pinned Pi behavior)` | remember executionMode "sequential" -> "parallel" | survived | first probed at a dependent (`remember` executionMode set to "parallel"): survived, and `tests/episodic/w3-contract.test.ts:450` kills that mutant. Re-targeted at the unit it claims, Pi 0.80.6 `agent-loop.js:289-290` (per-tool `sequential` ignored), in a private copy of the package: **killed** |
| S60 | `tests/plans/archive.test.ts`: rejects when tasks are not all Done (To Do) | `lib/plans/archive.ts:85 archivePlan non-Done guard` | guard only rejects In Progress/Blocked tasks, letting To Do tasks archive | killed |  |
| S61 | `tests/plans/file-system.test.ts`: returns null when plan file does not exist | `lib/plans/file-system.ts:183 readPlanFile` | missing-file branch checks code === "ENOTDIR" instead of "ENOENT" | killed |  |
| S62 | `tests/plans/plan-manager.test.ts`: should preserve spec after update | `lib/plans/plan-manager.ts:224 updatePlanLocked` | returned spec is input.spec only (drop the readSpecFile fallback) | killed |  |
| S63 | `tests/prompts/loader.test.ts`: replaces parentRole with provided value | `lib/prompts/loader.ts:120 renderRuntimeTemplate` | parentRole substitution ignores context and always uses "unknown" | killed |  |
| S64 | `tests/scripts/knowledge-surface-backfill.test.ts`: refuses to audit when a frozen archived plan disappears | `scripts/knowledge-surface-backfill.ts:142 inspectKnowledgeSurfaceBackfill` | vanished-plan guard off by one: vanished.length > 0 -> > 1 | killed | the mutant still throws, from a later guard; only the message regex tells the two apart |
| S65 | `tests/scripts/test-health-audit/carry-forward.test.ts`: refuses to carry a declaration absent from this epoch's run | `scripts/test-health-audit/carry-forward.ts:118 observeRuntime` | dropped the observedAnywhere guard, so an all-not-collected run counts as a re-observation | killed | killed; the test and its unit were then deleted with `scripts/test-health-audit/` (D-037) |
| S66 | `tests/scripts/test-health-audit/probe.test.ts`: reports a record whose target resolves outside the project | `scripts/test-health-audit/artifacts.ts:2439 safeProjectPath` | root-escape guard disabled (condition made false, so no throw) | killed | killed; the test and its unit were then deleted with `scripts/test-health-audit/` (D-037) |
| S67 | `tests/sessions/manifest.test.ts`: preserves createdAt when appending | `lib/sessions/manifest.ts:68 appendSession` | reset createdAt along with updatedAt on append (manifest.createdAt = manifest.updatedAt = now) | killed | the kill depends on the clock moving at least 1 ms between create and append (red 5 of 5 runs) |
| S68 | `tests/sessions/session-store.test.ts`: tool result causes no section to be added | `lib/sessions/session-store.ts:105 renderTranscriptMessage` | toolResult role routed through the assistant renderer | killed |  |
| S69 | `tests/skills/discovery.test.ts`: discovers both flat .md and directory skills | `lib/skills/discovery.ts:208 scanForSkills` | flat .md root guard flipped: isRoot -> !isRoot | killed |  |
| S70 | `tests/skills/exporter.test.ts`: removes stale files from previous export | `lib/harness-adapters/sync.ts:2355 applySyncPlanInTransaction install loop` | install overlays the staged directory onto the existing target (cp recursive) instead of backing up and renaming, leaving stale files | killed | red through the sync transaction's post-install exact-state check, not the declaration's own assertion |
| S71 | `tests/skills/shipped-frontmatter.test.ts`: exported skills are named after their path under external-skills | `external-skills/cosmonauts/tasks/SKILL.md:2 frontmatter name (shipped content; NOT under lib/cli/domains/scripts/bundled)` | exported skill name 'cosmonauts-tasks' -> 'tasks' (forgot the path prefix) | killed | the declaration reads the shipped `external-skills/**/SKILL.md` files and never calls `lib/skills/discovery.ts`, so the mutant is in the shipped frontmatter it reads (shipped content is a valid target, D-038) |
| S72 | `tests/tasks/file-system.test.ts`: round-trip preserves content exactly | `lib/tasks/file-system.ts:206 saveTaskFile` | content.trim() before writing (drops trailing newline) | killed |  |
| S73 | `tests/tasks/task-manager-concurrency.test.ts`: allocates distinct IDs for concurrent creates across separate TaskManager instances | `lib/entity-file-lock.ts:102 acquireEntityFileLock` | !isProcessAlive(existing.pid) flipped, so a contender reclaims a live holder's lock (two holders overlap) | survived | strengthened (32 concurrent creates), re-probe killed 5 of 5 runs, original green 3 of 3; the kill needs a lock collision, so it is probabilistic, not guaranteed on every run |
| S74 | `tests/tasks/task-parser.test.ts`: extracts Description section | `lib/tasks/task-parser.ts:153 extractSection` | section capture made greedy ([\s\S]*? -> [\s\S]*), swallowing following sections | killed |  |
| S75 | `tests/todo/todo-extension.test.ts`: returns nothing when list is empty | `domains/shared/extensions/todo/index.ts:83 before_agent_start todo-context hook` | hook registered on "agent_start" instead of "before_agent_start" (context never injected before a turn); note: dropping either empty-list guard (lines 84/86) is an equivalent mutant because the two guards are redundant for an empty list | survived | strengthened, re-probe killed |

First probe, at the corrected picks: 66 killed, 9 survived. (The superseded line-309 S57 probe also survived and is closed in its row.) After the survivor exits, every sampled declaration that still exists is recorded killed. Six were strengthened and re-probed to killed (S04, S16, S46, S51, S73, S75), and one (S42) was deleted. S59 was killed once it was re-targeted at the unit it claims, and S11 was killed by the type-check step. No survivor closed on an edit alone.

### Structure-breaking probes on names code resolves (B-007, D-005)

The full suite was run on each mutant in a throwaway worktree of `a124dba`, restoring with `cp`.

| Mutant | File | Result | Red tests attributable to the mutant |
|---|---|---|---|
| extension name `tasks` → `task` | `bundled/coding/agents/worker.ts` | killed (8 red) | `tests/agents/session-assembly.test.ts` (framework recall per shipped definition), `tests/domains/coding-agents.test.ts` (architecture_map_read registration), `tests/cli/dump-prompt.test.ts` ×3, `tests/coding-domain-rename.test.ts` |
| tools preset `coding` → `codng` | `bundled/coding/agents/worker.ts` | killed (4 red) | `tests/domains/coding-agents.test.ts`: uses valid tools values |
| delete capability file `coding-readwrite.md` | `bundled/coding/capabilities/` | killed (5 red) | `tests/agents/session-assembly.test.ts`, `tests/cli/dump-prompt.test.ts` ×3, `tests/coding-domain-rename.test.ts` |

`run-step`, `process-reaping` and `validate-harness-exports` also went red during these runs. They go red under the load of concurrent probe runs even without a mutant, so they are not counted.

## Rulings

Human, 2026-09-21: the provider-neutrality guards stay; the documentation-table
tests listed above as kept were deleted (D-019). Three tests remain red under
blanking, all on the runtime template.
