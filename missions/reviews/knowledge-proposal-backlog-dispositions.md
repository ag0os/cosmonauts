# Knowledge-proposal backlog — per-file dispositions (168 files)

Companion to `knowledge-proposal-backlog-analysis.md`. Produced 2026-08-27 by a
six-way parallel content survey of every proposal under `memory/agent/proposals/`
against the full curated corpus in `knowledge/`. This document is **staged review
material**: nothing here has been moved, edited, or deleted — every action is a
recommendation awaiting the human promotion act (INV-1).

Verdicts: **REDUNDANT** = claim already curated (cited) · **OVERLAP** = partially
curated; the proposal adds a stated delta · **NEW** = no meaningful curated
coverage · **WEAK** = too generic/stale to earn an index slot regardless of overlap.

Actions: **promote** = byte-identical move into `knowledge/<plan>/` via a
`knowledge-surface-promotion` ledger round · **merge → X** = human folds the
stated delta into curated record X by direct edit · **drop** = do not promote;
disposition of the file itself is an open policy question ·
**RULING** = needs an explicit curator decision first (conflict/supersession).

Totals: 19 REDUNDANT · 71 OVERLAP · 68 NEW · 10 WEAK.

---

## orchestration-surface-consolidation (12) — R1 O8 N3

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-keep-compatibility-evidence-opaque-at-the-runtime-boundary | OVERLAP | merge → durable-run-store-events.md | Curated has dependency-direction + evidence-in-activity; new: compat traffic rides an opaque generic activity event, re-encoded at the owning frontend edge, never becomes canonical lifecycle evidence. |
| convention-machine-oriented-run-commands-reserve-stdout-for-one-json-value | OVERLAP | promote (CLI-surface group) | durable-frontend-migration.md + analysis-capability-runtime.md each hold half; the positive three-part convention (one JSON on stdout / diagnostics to stderr / exit carries outcome) is unstated. |
| convention-resolve-exact-saved-names-before-permissive-expression-syntax | OVERLAP | **RULING** — promote as correction to chain-fanout.md | Documented REVERSAL of the curated precedence ("resolution is the fallback"): exact saved-name lookup now runs first. Must supersede, not sit beside. |
| convention-scheduler-store-wrappers-may-alter-event-writes-only | NEW | promote | Wrapper-delegation rule over the durable store; only event/diagnostic appends may differ. |
| decision-centralize-graph-run-initialization-behind-an-adoption-safe-seam | OVERLAP | merge → durable-graph-scheduler.md | New: create-or-adopt + seeding + initial event + scheduler passes in one per-run durable critical section; load-then-create unsafe across processes. |
| decision-keep-frontend-interruptions-distinct-from-scheduler-exits | NEW | promote | Discriminated-union run-start result; stop-policy outcomes can't widen scheduler exit reasons. |
| decision-model-a-future-compiler-shape-without-migrating-the-hot-path | NEW | promote | One-node spawn compiler as convergence model; non-blocking spawn hot path untouched until nested-run design. |
| gotcha-compatibility-cursors-belong-to-the-projected-event-space | OVERLAP | merge → durable-run-store-events.md | Curated covers `seq` cursors; new: for reconstructed legacy views, apply `since` after reconstruction; cursor = projected legacy-event count. |
| gotcha-dispatched-subcommands-may-bypass-top-level-runtime-bootstrap | OVERLAP | promote (CLI-surface group) | runtime-consolidation covers registry divergence; new: pre-parser dispatch inherits no flags/discovery/model selection. |
| gotcha-repair-partial-initialization-without-rewriting-durable-truth | OVERLAP | merge → durable-graph-scheduler.md | New: adoption-time repair — create pending records only for uncovered steps; differing topology stops with a diagnostic, never overwrites. |
| gotcha-resume-graphs-from-the-authoritative-original-work-set | REDUNDANT | drop | = durable-backend-step-model.md (`RunRecord.metadata.driveTaskIds`, never overwritten on resume — curated version is more concrete). |
| trade-off-retain-a-scoped-legacy-fallback-while-normalized-compatibility-matures | OVERLAP | merge → durable-run-store-events.md | New: read-side policy — verify projection completeness vs independent legacy count + degraded marker; fallback only inside the deprecated reader. |

## orchestration-hardening (10) — R1 O6 N3

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-abnormal-scheduler-drains-carry-structured-causes | OVERLAP | merge → durable-graph-scheduler.md | New: general classification convention (cause class, blocker identities, pending-work count, diagnostic-before-abort). |
| convention-migration-completion-requires-a-repository-wide-stale-reference-sweep | NEW | promote (review-lenses group) | Sweep immediately after migration-shaped work; runtime source outranks tests/docs. |
| convention-multi-seam-behaviors-require-proof-at-every-declared-seam | OVERLAP | promote (review-lenses group) | Extends analysis-investigation-procedures' symmetric-guard: acceptance criteria must enumerate every seam or split per seam. |
| convention-shared-primitives-trigger-blast-radius-verification | OVERLAP | promote (review-lenses group) | Curated has two instances; new: the reusable lens (enumerate call sites; check throw/return/empty/warning/fallback at each). |
| convention-task-graphs-encode-only-true-dependencies | NEW | promote | Edge only for genuinely consumed artifact/contract/state; directly actionable for task-manager. |
| decision-centralized-design-intent-outranks-a-narrow-single-site-criterion | OVERLAP | merge → spec-plan-intent.md | Implementation-side corollary of the deviation protocol: one implementation authority per named cross-cutting rule. |
| decision-long-running-orchestration-snapshots-its-tooling-inputs | OVERLAP | merge → durable-frontend-migration.md | Curated freezes code + work set; new: freeze tooling inputs (prompt templates, config) at launch into run state. |
| decision-terminal-evidence-overrides-stale-running-state | REDUNDANT | drop | = durable-run-store-events.md (terminal events win; `statusSource` exposes disagreement). |
| gotcha-detached-launcher-exit-is-not-run-completion | OVERLAP | merge → drive-process-reaping.md or CLI-surface group | New: launcher output contract (print run identity + observation command; command-local flags before global-flag warnings). |
| gotcha-review-scope-must-use-the-actual-local-integration-base | NEW | promote (review-lenses group) | Merge base vs remote-tracking drift; already-merged work scored as current change buries real regressions. |

## driver-primitives (10) — R2 O7 N1

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-exclude-orchestration-metadata-from-driver-created-commits | REDUNDANT | drop | = drive-resilience-state-model/d81a3f41 + task-id-system.md (exact path set curated twice). |
| convention-inject-backends-and-preserve-the-full-child-execution-context | OVERLAP | merge → durable-frontend-migration.md | Fields curated as fact; new: the rule + failure mode (dropping an optional-looking field silently disables lineage). |
| decision-keep-execution-specifications-serializable | OVERLAP | merge → durable-backend-step-model.md | New: run-spec-level rule — serializable identity/paths/work/policy only; same spec under inline and detached. |
| decision-persist-events-before-publishing-live-notifications | OVERLAP | **RULING** — reconcile per-stream policy | In tension with durable-run-store-events.md sidecar failure-isolation: authoritative-log append must precede bus publish; sidecar failure stays isolated. Distinguish streams before promoting. |
| decision-return-a-run-handle-immediately-for-long-running-tools | OVERLAP | merge → parallel-agent-spawning.md | New: handle contract binding spawn-accepted pattern to run identity + cancellation + cursor-tail. |
| decision-separate-report-parsing-from-outcome-derivation | OVERLAP | merge → durable-backend-step-model.md | New: purity split — context-free parser; unknown×verification truth table in a separately testable step. |
| decision-share-one-lock-agnostic-run-loop-across-execution-modes | NEW | promote (execution-modes group) | Exported run loop owns ordering/events/policy; deliberately does NOT take the lifecycle lock; each wrapper locks its own process. |
| decision-use-separate-locks-for-run-ownership-and-commit-serialization | OVERLAP | promote (execution-modes group) | Curated pins commit-lock root; new: the two-lock rationale (plan-scoped lifecycle vs repo-wide commit serialization). |
| gotcha-a-successful-commit-and-task-state-update-are-not-atomic | REDUNDANT | drop | = drive-resilience-state-model.md finalization_failed model (built out further there). |
| trade-off-treat-partial-work-as-committed-progress-not-completion | OVERLAP | merge → drive-resilience-state-model.md | Curated has mechanism + caught regression; new: the stated default (stop unless caller opts to continue). |

## drive-smoke-fixes (7) — R3 O3 N1

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-blocked-input-reports-include-the-command-and-observed-output | NEW | promote | Worker-side evidence contract; precondition that makes contradicted-path retry decidable. |
| decision-put-progress-evidence-in-the-model-visible-tool-channel | REDUNDANT | drop | = memory-hardening.md (universal contract, provider-verified). |
| decision-retry-contradicted-missing-path-blocks-once | OVERLAP | merge → drive-resilience-state-model.md | Behavior curated as a caught regression; the rule itself (retry once iff path resolves inside project root and exists) unstated. |
| decision-separate-backend-execution-root-from-artifact-storage | OVERLAP | merge → drive-resilience-state-model.md | New: prohibition on overloading one working-directory field with both roles. |
| decision-serialize-file-backed-id-allocation-with-a-filesystem-lock | REDUNDANT | drop | = task-id-system.md (withTaskCreateLock incl. reload-inside-lock + cross-branch caveat). |
| gotcha-filesystem-locks-need-stale-owner-recovery | REDUNDANT | drop | Superseded by episodic-log-detached-hardening.md (goes further: reclamation race is irreducible). |
| trade-off-bound-event-text-while-preserving-cursor-based-recovery | OVERLAP | **RULING** — reconcile with memory-hardening | "Complete payload in the structured response" conflicts with memory-hardening's details-never-reach-the-model finding. |

## domain-authoring (11) — O1 N10

Two coherent uncovered subject areas: (1) role bindings / execution identity,
(2) domain visibility + provider loading. Promote-group as new record sets.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-centralize-public-surface-interpretation | NEW | promote (visibility group) | Domain visibility policy boundary; grep across knowledge/ confirms no coverage. |
| convention-domain-prompt-directories-contain-personas-only | OVERLAP | **RULING** — merge → domain-config/ | Reassigns base/runtime prompt ownership to framework-owned paths; conflicts with package-system/shared-as-final-fallback (this one appears to supersede). |
| decision-binding-precedence-is-live-then-project-then-same-name | NEW | promote (bindings group) | Role→domain bindings absent from knowledge/; distinct from the curated domain-context chain. |
| decision-domain-id-conflicts-are-precedence-sensitive-and-provenance-rich | NEW | promote (see ruling 5) | Equal-precedence hard-fail + per-provider provenance; sharpens the package-system merge decision. |
| decision-domain-visibility-is-default-public-with-an-explicit-internal-deny-list | NEW | promote (visibility group) | Per-asset-type deny-list semantics; owner keeps access; internal vs not-found reported separately. |
| decision-live-binding-state-is-shared-by-reference-and-reconstructed-from-session-history | NEW | promote (bindings group) | Mutable binding store by reference; copied-map-at-construction bug; session-entry replay. |
| decision-role-binding-preserves-requested-and-resolved-identities | NEW | promote (bindings group) | Two-field identity through authorization, persistence, display; default domain as bindable role. |
| gotcha-a-root-domain-package-needs-an-exact-source-kind | NEW | promote (visibility group) | "Path is one domain root" vs "children are roots"; sibling-package exposure from scanning the store parent. |
| gotcha-filter-inactive-providers-before-validation-and-conflict-detection | NEW | promote (visibility group) | Active-domain set applied before validation, conflict detection, merge, registry build, binding validation. |
| gotcha-malformed-execution-identity-bindings-must-not-disappear-silently | NEW | promote (bindings group) | Bindings determine execution identity; silent same-name fallback can execute the wrong provider. |
| trade-off-live-binding-switches-affect-future-resolutions-only | NEW | promote (bindings group) | Running agents keep definitions/prompts/tools/models captured at start. |

## package-system (9) — R1 O4 N4

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-order-domain-sources-from-stable-baseline-to-ephemeral-override | REDUNDANT | drop | = domain-eject-and-tiers.md (same order at finer granularity, 7 named tiers). |
| convention-preserve-ordered-roots-for-merged-domains | NEW | promote | Ordered root list for merged domains; singular root field rejected. Entirely uncovered. |
| convention-use-own-portable-shared-resource-resolution-tiers | OVERLAP | merge → domain-config.md | Inserts a portable-domains middle tier into the curated two-tier (agent domain → shared) rule; one uniform order across asset kinds. |
| decision-keep-package-discovery-outside-domain-loading | NEW | promote | Scanners emit generic domain-source descriptors; domain loading accepts only those. |
| decision-merge-duplicate-domain-ids-at-the-resource-boundary | NEW | promote (see ruling 5) | merge/replace/skip with merge default; reconcile with the equal-precedence hard-fail sibling. |
| decision-resolve-domain-resources-through-one-runtime-abstraction | OVERLAP | merge → runtime-consolidation.md | Semantic resolver supersedes the curated domainsDir string-path contract. |
| decision-treat-shared-as-a-special-final-fallback | OVERLAP | **RULING** — see ruling 4 | Shared must not be an ordinary portable provider; resolves after agent domain + all portables. Conflicts with personas-only. |
| decision-validate-package-declarations-before-installation-writes | NEW | promote | Manifest-as-contract; every declared domain path resolves before any store mutation. |
| trade-off-separate-persistent-installs-from-session-only-development-inputs | OVERLAP | merge → domain-eject-and-tiers.md | Explicit three-mode framing: copy/clone portable, link and plugin-dir fast but session-only. |

## external-backends-and-cli (11) — R2 O8 N1

Survivors form one coherent uncovered subject: the **detached-run transport**.
Recommended as a promote-group into `knowledge/external-backends-and-cli/`
(beside the one already-promoted atomic).

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-detached-run-specifications-remain-serializable-boundary-contracts | OVERLAP | promote (transport group) | New over durable-backend-step-model: cross-process input = same contract as inline; runtime deps rebuilt in-child via factories. |
| convention-execution-mode-parity-is-behavioral-not-byte-identical | NEW | promote (transport group) | Cross-transport equivalence with excluded-field list; existing byte-identity rules are a different axis. |
| convention-external-command-adapters-use-structured-argv-and-explicit-probes | OVERLAP | promote (transport group) | New: probe-before-durable-state ordering + required error payload. |
| decision-detached-execution-process-owns-the-complete-run-lifecycle | OVERLAP | promote (transport group) | New: explicit ownership enumeration; fast-exiting parent CLI never holds the run lock. |
| decision-detached-mode-rejects-session-coupled-backends | OVERLAP | promote (transport group) | New: eligibility gate before work-dir creation; structured error steering to inline. |
| decision-plan-locks-and-repository-commit-locks-protect-different-scopes | OVERLAP | promote (transport group) | New: two-lock scope model with distinct lifetimes. |
| decision-separate-volatile-process-identity-from-durable-run-completion | OVERLAP | promote (transport group) | New: completion-record-wins precedence; PID+start-time matching for reuse detection. |
| gotcha-jsonl-tailers-must-preserve-unread-byte-boundaries | OVERLAP | promote (transport group) | New: byte-level live-tail contract (bounded creation wait; retain post-newline bytes; never advance past unparsed record). |
| gotcha-killing-a-detached-supervisor-may-leave-backend-children-alive | REDUNDANT | drop | = drive-process-reaping.md (that entire record is this claim, sharper). |
| gotcha-resuming-after-interruption-requires-a-clean-tree-guard | REDUNDANT | drop | = drive-resilience-state-model.md (resume derivation + dirty-worktree recheck curated). |
| trade-off-per-run-compilation-freezes-source-at-a-measurable-cost | OVERLAP | promote (transport group) | New: the cost side of the curated frozen-child benefit. |

## external-agent-orchestration (7) — O1 N6

Agent packaging/export is essentially uncurated. Promote-group into
`knowledge/external-agent-orchestration/` beside the 2 promoted atomics; anchor =
declarative-package-definitions.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-explicit-packages-own-their-external-tool-policy | NEW | promote | Tool permissions as part of the reviewed export contract; exact allowlist replaces preset. |
| convention-separate-runtime-cwd-from-temporary-prompt-assets | NEW | promote | Weakest of dir; load-bearing half (temp asset dir must never become implicit cwd) is specific. |
| decision-make-subscription-safe-authentication-the-default | NEW | promote | Drop API credential from child env by default; zero curated auth/billing coverage. |
| decision-use-declarative-package-definitions-as-the-export-boundary | NEW | promote | Architectural spine of the export subsystem. |
| gotcha-raw-internal-prompts-require-portability-checks | NEW | promote | Portability gate applies to prompt reuse, not metadata/provenance reuse. |
| trade-off-inline-full-skill-content-for-hermetic-exports | OVERLAP | promote | Extends promoted skill-filtering atomic: what happens to selected bodies (inline, dedupe, fail on missing). |
| trade-off-schema-extensibility-does-not-imply-exporter-support | NEW | promote | Reserved target-specific blocks vs narrower supported-target type. |

## harness-adapters (13) — O5 N8

Promote-group as its own record set in `knowledge/harness-adapters/` — the five
OVERLAPs each restate a curated invariant one layer down in filesystem/provenance
context; folding into Drive/durable records would misfile them.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-live-migrations-advance-only-on-durable-evidence | NEW | promote | Phase gating on re-read durable evidence + zero-selected check. |
| decision-capabilities-are-registered-at-the-finest-load-bearing-shape | NEW | promote | target × kind × mode × shape modelling; driver: dir-symlink-following harness ignoring file symlinks. |
| decision-destructive-absence-requires-a-healthy-complete-inventory | OVERLAP | promote | Filesystem specialization of analysis-investigation's missing-evidence invariant. |
| decision-legacy-copy-migration-requires-historical-byte-lineage | NEW | promote | One-time proof binding revision/digest/owner/identity; re-read under transaction lock. |
| decision-new-native-authority-needs-a-bounded-bootstrap-ceremony | NEW | promote | Bootstrap provenance for assets with no historical source. |
| decision-read-only-check-observes-pending-recovery-without-performing-it | OVERLAP | promote | Check-vs-repair boundary in detail (double-read; explicit must-not list). |
| decision-recorded-materialization-mode-is-sticky | NEW | promote | Mode resolution order; bare sync must not silently convert link→copy. |
| decision-same-name-assets-require-provenance-not-resemblance | NEW | promote | Permanent-conflict-on-untraceable-origin; pairs with byte-lineage. |
| decision-transaction-identity-follows-the-canonical-mutation-root | OVERLAP | promote | Alias-collapse rule: labels resolving to one root = one transaction. |
| gotcha-durable-commit-intent-must-govern-in-process-exceptions-too | OVERLAP | promote | In-process leg of intent-before-confirmation. |
| gotcha-persisted-paths-are-evidence-not-deletion-authority | OVERLAP | promote | Deletion-authority framing over loadRun re-validation. |
| gotcha-recovery-must-accept-empty-and-absent-member-vectors-it-can-create | NEW | promote | Validator-vs-writer state-space mismatch stranding recovery. |
| trade-off-machine-global-generated-assets-use-visible-last-writer-freshness | NEW | promote | Machine-global output with project-dependent content; recorded generating project. |

## coding-agnostic-framework (10) — O6 N4

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-make-test-decoupling-inventories-executable | OVERLAP | merge → code-structure-map.md | Ledger is curated as live obligation in 3 records; new: the design rule that produced it. |
| convention-scan-only-audits-require-dispositions | NEW | promote (with ledger convention, one record) | Audit-report artifact contract incl. explicit zero-findings row. |
| convention-use-minimal-synthetic-installable-domains-in-framework-tests | OVERLAP | merge → domain-config.md | New: package-level fixture loaded through production discovery. |
| decision-centralize-default-domain-resolution | OVERLAP | merge → domain-config/ (with orchestration-defaults, one rule) | Default-domain contract for domainless ops; verify installed; source-scan test vs fallback literals. |
| decision-define-cli-runnability-by-default-assistant-availability | OVERLAP | **RULING** — supersedes main-domain-and-cosmo-rename/d6290944 gotcha; dedupe with framework-extraction/agent-independent-commands | One runnability predicate reused by all modes. |
| decision-framework-orchestration-defaults-belong-outside-domains | OVERLAP | merge (same rule as centralize-default-domain-resolution) | One shared resolver for omitted-input defaults; near-duplicate within dir. |
| decision-record-resolved-agent-identity-at-the-resolution-seam | OVERLAP | merge → session-lineage.md | New: green run ≠ evidence of which qualified agent executed; emit requested+resolved at the seam. |
| gotcha-resource-fallback-is-not-runtime-identity | NEW | promote | Fallback domain for prompts vs domain baked into authorization/registry/identity. |
| gotcha-unqualified-role-routing-can-depend-on-absence | NEW | promote | Routing test must assert the absence invariant. |
| trade-off-relocate-defaults-while-preserving-explicit-legacy-paths | NEW | promote | Opposite case of curated delete-unused trade-off; compatibility copy + both legs tested. |

## framework-extraction (8) — O4 N4

Survivors form a new **distribution/packaging** record (publication, catalog
paths, origin-tracked updates).

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-bundled-domains-use-the-public-package-layout | OVERLAP | promote (distribution group) | New: structural-identity rule — bundled content exercises the public extension contract. |
| decision-agent-independent-commands-remain-usable-without-installed-domains | OVERLAP | **RULING** — dedupe with coding-agnostic-framework/cli-runnability | Positive contract: empty domain store is a supported first-run state. |
| decision-keep-framework-infrastructure-built-in-and-distribute-domains-as-packages | OVERLAP | drop | Thesis already spread across domain-config + domain-eject-and-tiers + local-vs-shared; incremental claim narrow. |
| decision-persist-installation-origin-for-source-aware-updates | OVERLAP | promote (distribution group) | Generalizes curated catalogName fix: source kind + locator + install time; per-origin update dispatch. |
| gotcha-published-package-allowlists-must-include-runtime-loaded-content | NEW | promote (distribution group) | Install-from-pack smoke test is the only proof; npm publication uncovered. |
| gotcha-resolve-bundled-catalog-paths-from-the-framework-installation | NEW | promote (distribution group) | Resolve against installation root, not cwd; test from unrelated temp dir. |
| gotcha-use-an-isolated-worktree-when-moving-live-loaded-agent-definitions | NEW | promote | Self-hosting migration safety; controlling session on the intact tree. |
| trade-off-package-variants-may-share-one-domain-identity | NEW | promote (distribution group) | Substitute-vs-composable; explicit winner rule when both installed. |

## main-domain-and-cosmo-rename (4 remaining) — O2 N1 W1

Survivors merge into the existing `knowledge/main-domain-and-cosmo-rename/`
sibling set (5 already-promoted atomics).

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-qualify-cross-domain-agent-references-not-same-domain-references | OVERLAP | **RULING** — promote as correction | CORRECTS domain-config/9d1c5f3b + 5e7a9c1b ("qualified exclusively" is stale): cross-domain qualified, same-domain unqualified. Retire the contradicted guidance on promotion. |
| decision-delegation-only-agents-receive-no-baseline-coding-tools | NEW | promote | Agent tool-pack policy entirely uncurated; blast-radius rationale. |
| decision-separate-the-cross-domain-executive-from-domain-coordinators | OVERLAP | promote | Sibling records presuppose the executive; this justifies it (no redundant coordinator hop). |
| trade-off-prompts-may-reference-optional-capabilities-with-an-explicit-fallback | WEAK | drop | Generic + one-off delivery accommodation between two mergeable plans. |

## quality-contracts (7) — R3 O3 W1

Every survivor documents the superseded QC-* format (replaced by the abstract
gate ladder). Recommended: **drop the dir**; salvage one fragment by merge.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-every-quality-criterion-has-an-id-and-verification-owner | OVERLAP | drop (historical format) | Authoring rule for the QC-* format the ladder superseded. |
| convention-non-manual-contract-criteria-gate-merge-readiness | OVERLAP | merge → artifact-format-redesign.md (fragment only) | Salvage: manual criteria are explicit human obligations, never inferred from automated passes. |
| convention-quality-criteria-state-observable-outcomes | REDUNDANT | drop | Curated version carries more (≥⅓ failure-case rule). |
| decision-contract-failures-enter-normal-remediation-routing | REDUNDANT | drop | = integration-verifier.md + spec-plan-intent.md. |
| decision-plan-quality-contracts-augment-baseline-verification | WEAK | drop | Truism once the tiered ladder is curated. |
| decision-quality-contracts-live-with-the-plan | REDUNDANT | drop | Stated across three records. |
| trade-off-convention-based-contracts-avoid-schema-overhead | OVERLAP | drop (or one-line note in artifact-conformance-gate.md) | Only the schema-avoidance framing is new. |

## dialogic-planner (7) — R3 O3 N1

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-fuzzy-ideas-diverge-before-converging | OVERLAP | merge → spec-plan-quality-gates-a.md | Divergence rule absent from knowledge/ (lives only in the design-dialogue skill). |
| convention-product-framing-and-engineering-design-have-separate-owners | REDUNDANT | drop | = the curated three-route planning router. |
| decision-order-delivery-design-as-structure-behaviors-then-tasks | REDUNDANT | drop | Curated in artifact-format-redesign atomics; premise stale (no tdd-planner agent). |
| decision-planning-behavior-follows-invocation-mode | OVERLAP | merge → spec-plan-quality-gates-a.md | New: interactive 2-3-alternatives + incremental-approval obligation. |
| decision-review-the-final-planning-artifact-before-execution | OVERLAP | drop | Placement rule thin; guarded situation no longer exists in shipped chains. |
| decision-run-independent-review-lenses-as-a-parallel-panel | NEW | **RULING** — promote with qualifier | Only coverage of shipped security/performance/ux-reviewer agents; must carry planning-system-hardening's on-demand-not-standing decision. |
| trade-off-defer-planner-memory-reads-until-retrieval-is-selective | REDUNDANT | drop | The awaited selective retrieval shipped and is curated; deferral resolved. |

## analysis-capabilities (8) — R3 O4 N1

Survivors merge into `analysis-capability-runtime.md` (append, or create
`knowledge/analysis-capability-runtime/` — none exists today).

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-distinguish-unavailable-support-from-attempted-execution-failure | REDUNDANT | drop | Stated across all three later analysis narratives. |
| decision-keep-capability-contracts-inward-and-provider-i-o-at-the-edge | REDUNDANT | drop | Curated verbatim in the runtime narrative. |
| decision-remediation-should-rerun-the-capability-request | OVERLAP | merge → analysis-gate-rewiring.md | New: rationale (results can't cross agent boundaries losslessly) + no-longer-reproduces branch. |
| decision-subprocess-runners-must-preserve-termination-evidence | OVERLAP | merge → analysis-capability-runtime.md | New: five-way outcome taxonomy; cancellation through every adapter layer; finite timeout. |
| decision-verdicts-belong-only-to-verdict-bearing-result-kinds | REDUNDANT | drop | = D-013, curated three times incl. type-level enforcement. |
| gotcha-read-only-analysis-includes-caches-and-introspection-side-effects | NEW | promote | Non-mutation invariant incl. status/version calls; whole-worktree snapshot verification. |
| gotcha-read-only-discovery-must-not-execute-repository-controlled-binaries | OVERLAP | merge → analysis-capability-runtime.md | New: the rule behind the mechanism (detection ≠ permission; consent recorded outside the repo). |
| gotcha-scoped-requests-must-never-widen-silently | OVERLAP | merge → analysis-gate-coverage.md | New: pre-invocation half (validate scope at runtime; structured unsupported-scope before spawn). |

## ruby-rails-skills (9) — N8 W1

Skill-pack architecture is entirely uncurated. Promote-group as a new
**skill-pack-architecture** record set.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-base-language-guidance-must-remain-framework-agnostic | NEW | promote | One-way ruby→rails dependency direction; enacted by the shipped pack. |
| convention-public-skill-ids-are-explicit-and-globally-descriptive | NEW | promote | Nested path ≠ invocation contract; explicit ID declaration. |
| convention-reference-documents-are-private-assets-of-one-parent-skill | WEAK | drop | skill-writing already mandates it; additions are minor mechanics. |
| convention-skill-pack-qa-must-verify-boundaries-and-navigation | NEW | promote | Pack-level QA as a semantic dependency graph; repo tests can't catch content-only defects. |
| decision-canonical-cross-domain-guidance-is-linked-not-duplicated | NEW | promote | Internal canonical skills linked, not duplicated; one maintenance home. |
| decision-nested-content-packs-should-reuse-recursive-discovery-and-export-seams | NEW | promote | Strongest in dir; verified live (18 skills two levels deep, no loader change). |
| decision-redistribute-source-content-when-target-boundaries-change | NEW | promote (curator may trim) | Borderline generic; concrete part is the source→target mapping artifact. |
| decision-repository-detection-belongs-in-foundational-meta-skills | NEW | promote | Verified live (rails-conventions, rails-stack-profiles). |
| trade-off-prefer-coherent-skill-granularity-over-an-arbitrary-task-count-target | NEW | promote | Why 16+2 not an umbrella; compress implementation ownership, never public architecture. |

## roadmap-system (7) — N2 W5

Headline is **staleness**: backfilled from a March plan whose Now/Next/Later
horizon model no longer exists.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-roadmap-location-encodes-item-status | WEAK | drop | Horizon model superseded; surviving clauses live in the shipped roadmap skill. |
| convention-size-each-roadmap-item-to-one-planning-unit | WEAK | drop | Verbatim restatement of the roadmap skill's Granularity section. |
| decision-humans-own-priority-agents-maintain-lifecycle-state | WEAK | drop (salvage one clause) | Lifecycle half false today; salvage "agents never autonomously reprioritize" into a future work-lifecycle record. |
| decision-keep-in-flight-work-visible-until-archival-completes | WEAK | drop | CONTRADICTED by current procedure (item removed when the plan is created); promoting would install a false procedure. |
| decision-separate-architectural-truth-from-directional-truth | NEW | promote (thin — pair with forge-lifecycle context) | Actively practiced; roadmap links to missions/architecture sources of truth. |
| decision-use-priority-horizons-instead-of-sequential-phases | WEAK | drop | Design rationale for a retired structure. |
| trade-off-start-roadmap-governance-as-a-manual-protocol | NEW | promote (thin) | Still true and load-bearing; accepted drift cost matches the skill's recovery entry. |

## fallow-temp-exceptions-cleanup (7) — O3 N3 W1

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-lock-observable-behavior-before-complexity-refactors | NEW | merge → orchestration-refactor.md | Suppression-removal trigger + no test-only exports when a public boundary reaches the code. |
| convention-reduce-complexity-with-behavior-shaped-decomposition | OVERLAP | merge → orchestration-refactor.md | Complexity-source→pattern lookup + wholesale-relocation negative rule. |
| decision-classify-static-analysis-exceptions-by-intent-before-removal | WEAK | drop | `docs/fallow-exceptions.md` states it more precisely; proposal is a lossy paraphrase. |
| decision-keep-shared-cli-helpers-below-command-business-logic | NEW | promote (static-analysis pair) | cli/ layering rule; rule-of-three; two-way import ban. No curated CLI-layer coverage. |
| decision-remove-duplication-baselines-in-two-gated-phases | OVERLAP | promote (static-analysis pair) | The sequencing procedure; cross-reference docs/fallow-exceptions.md rather than restate. |
| gotcha-parallel-refactors-must-serialize-shared-file-ownership | OVERLAP | merge → parallel-agent-spawning.md | Sharpens: function-level disjointness is not parallel-safety evidence. |
| trade-off-deduplicate-tests-without-hiding-their-intent | NEW | merge → orchestration-refactor.md (or docs/testing.md pointer) | Shared-helper threshold + assertion-values-visible counterweight. |

## observability (6) — O3 N2 W1

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-aggregate-usage-at-stage-iteration-granularity | OVERLAP | merge → chain-fanout.md or chain-profiler.md | New: per-stage-iteration record shape; retries/coordinator loops stay visible. |
| convention-maintain-a-canonical-framework-capability-reference | WEAK | drop | Restates the shipped pi skill's upkeep policy (already in AGENTS.md). |
| decision-observe-spawned-sessions-at-their-boundary | OVERLAP | merge → session-lineage.md | New: subscribe-before-start/unsubscribe-before-dispose contract; normalize only four signals. |
| decision-separate-local-diagnostics-from-orchestration-event-streaming | NEW | promote | Two-ownership split: in-session extension (durable diagnostics) vs external subscriber (progress). |
| gotcha-capture-session-statistics-before-disposal | OVERLAP | merge → session-lineage.md | Core curated; new: typed stats helper (Pi API varies across pinned versions). |
| gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions | NEW | promote | File-backed vs in-memory compaction difference; fallback strategy. Orchestration sessions run in-memory. |

## agent-thinking-levels (5) — N5

Cleanest dir: thinking-level configuration entirely absent from knowledge/;
every claim verified against current source. Promote-group as one
session-option-resolution record set.

| file (prefix) | verdict | action | related / delta |
|---|---|---|---|
| convention-thinking-configuration-mirrors-model-configuration | NEW | promote | getThinkingForRole beside getModelForRole; same seam. Verified live. |
| decision-agent-thinking-levels-use-the-existing-session-api | NEW | promote | Negative rule: no prompt-encoded thinking, no parallel subsystem. |
| decision-cli-thinking-selection-applies-to-spawned-chain-agents | NEW | promote | -t is the chain-wide fallback for spawned agents, not the parent session. |
| decision-thinking-level-precedence-is-explicit-spawn-role-definition-then-chain-default | NEW | promote | Verified exactly against model-resolution.ts:61-91. Highest value in dir. |
| gotcha-thinking-defaults-have-model-compatibility-and-cost-consequences | NEW | promote | Type validity ≠ model support; provider may reject or ignore. |

---

## Rulings queue (curator decisions needed before or during promotion)

1. **chain-fanout.md precedence reversal** — promote name-first resolution as an explicit correction; amend or annotate the curated record.
2. **domain-config qualified-IDs guidance is stale** — promoting the cross-domain-qualification convention should retire "qualified exclusively" in domain-config/9d1c5f3b + 5e7a9c1b.
3. **cli-runnability predicate** supersedes the curated infrastructure-domain-guard gotcha AND duplicates framework-extraction/agent-independent-commands — pick one statement, mark the gotcha superseded.
4. **shared-as-final-fallback vs personas-only prompt directories** (package-system vs domain-authoring) — the later domain-authoring proposal appears to supersede; only one should reach the index.
5. **duplicate-domain-ID merge default vs equal-precedence hard-fail** — reconcile as merge-applies-to-unequal-precedence; neither proposal states it.
6. **persist-before-publish vs sidecar failure-isolation** — distinguish authoritative-log policy from normalized-sidecar policy per stream before promoting.
7. **bounded-event-text "complete payload in structured response"** vs memory-hardening's details-never-reach-the-model — reconcile wording before promoting.
8. **review-lens panel** — promote only with planning-system-hardening's on-demand-not-standing qualifier attached.
9. **QC-format survivors** — confirm dropping quality-contracts wholesale (vs keeping historical-format footnotes under artifact-format-redesign).
10. **centralize-default-domain-resolution + orchestration-defaults-outside-domains** — one rule, two assets; merge into a single statement before promotion.
