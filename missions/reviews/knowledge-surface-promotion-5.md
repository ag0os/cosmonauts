---
kind: knowledge-surface-promotion
plan: knowledge-adoption
round: 5
promotedBy: Agustin Calabrese
promotedAt: '2026-08-27T00:00:00Z'
selection: ratified-drops
ratifiedVia: missions/reviews/knowledge-proposal-backlog-dispositions.md
promotedCount: 0
rejectedCount: 33
promotions: []
rejections:
  - path: memory/agent/proposals/orchestration-surface-consolidation/gotcha-resume-graphs-from-the-authoritative-original-work-set-4476da97b205.md
    sha256: 55514167c05263fd09046cabfb29eec04f318a909b4f62e0d28673b6b5258d99
    reason: >-
      redundant: curated in knowledge/durable-backend-step-model.md (driveTaskIds rule, more concrete)
  - path: memory/agent/proposals/orchestration-hardening/decision-terminal-evidence-overrides-stale-running-state-3e069d31eb89.md
    sha256: 027f6971af8549f49dd930204436312e182638a7bfbf8a709bdcf6cbfb12b1ef
    reason: >-
      redundant: curated in knowledge/durable-run-store-events.md (terminal events win; statusSource)
  - path: memory/agent/proposals/driver-primitives/convention-exclude-orchestration-metadata-from-driver-created-commits-10c760f10119.md
    sha256: d9af5d90f1721b631379394726c9699d604c4b4586be0e4ef955c22dd1a76349
    reason: >-
      redundant: exact path set curated in knowledge/drive-resilience-state-model/d81a3f41 and knowledge/task-id-system.md
  - path: memory/agent/proposals/driver-primitives/gotcha-a-successful-commit-and-task-state-update-are-not-atomic-2e859524b84b.md
    sha256: 3ca5221c759dd32477e5f26c2ca1ed18c100c222374972592245d9dfce723eab
    reason: >-
      redundant: knowledge/drive-resilience-state-model.md finalization_failed model builds this claim out
  - path: memory/agent/proposals/drive-smoke-fixes/decision-put-progress-evidence-in-the-model-visible-tool-channel-9ee3b579fdc2.md
    sha256: d331a0fcad9bef0b5f97424908284c0b9e4a7e2ccc5b3e6bee86d681c0c15ed5
    reason: >-
      redundant: knowledge/memory-hardening.md states the universal, provider-verified contract
  - path: memory/agent/proposals/drive-smoke-fixes/decision-serialize-file-backed-id-allocation-with-a-filesystem-lock-bcda72ead313.md
    sha256: bb4022146e6b548a8a7ae2cf6df12088828cd160a46582f391ee53fb8abbb72a
    reason: >-
      redundant: knowledge/task-id-system.md (withTaskCreateLock incl. reload-inside-lock + cross-branch caveat)
  - path: memory/agent/proposals/drive-smoke-fixes/gotcha-filesystem-locks-need-stale-owner-recovery-1ac71644b732.md
    sha256: b1ec6ff0eee973ed556aa43a6f2ec6af89eff377834dfa54a1d424363b759e3d
    reason: >-
      superseded: knowledge/episodic-log-detached-hardening.md goes further (reclamation race is irreducible)
  - path: memory/agent/proposals/external-backends-and-cli/gotcha-killing-a-detached-supervisor-may-leave-backend-children-alive-c4b311ecbcf2.md
    sha256: 399ecd11d84db3a076dc9c9b8c5029571d07a0e939c420016e5f1c295cf8036f
    reason: >-
      redundant: knowledge/drive-process-reaping.md is this claim, sharper
  - path: memory/agent/proposals/external-backends-and-cli/gotcha-resuming-after-interruption-requires-a-clean-tree-guard-85f4100abcba.md
    sha256: 19c778488a8a28e81dba47321ebd04c4d63e5cf6bf0069bebde3483328b2ae77
    reason: >-
      redundant: knowledge/drive-resilience-state-model.md (resume derivation + dirty-worktree recheck)
  - path: memory/agent/proposals/framework-extraction/decision-keep-framework-infrastructure-built-in-and-distribute-domains-as-packages-e3166df5beea.md
    sha256: 2c047a69fec3827ac96a17936d20915bcbe78057a36b2589972797a776f96133
    reason: >-
      redundant: thesis spread across domain-config, domain-eject-and-tiers, local-vs-shared
  - path: memory/agent/proposals/main-domain-and-cosmo-rename/trade-off-prompts-may-reference-optional-capabilities-with-an-explicit-fallback-cc55f11b1292.md
    sha256: 487b90f5a7f7bfe9ba1236536ae1abeff25710756d2f3e958cbca54a5c2f1366
    reason: >-
      weak: generic practice + one-off delivery accommodation
  - path: memory/agent/proposals/quality-contracts/convention-every-quality-criterion-has-an-id-and-verification-owner-b638e2e87bb7.md
    sha256: 6e0a55c7153ecf16d50dc97919c32e758d9bd2be3bc666a9cbffd7e09f3dd5c3
    reason: >-
      superseded format: documents QC-* which the artifact-format-redesign gate ladder replaced
  - path: memory/agent/proposals/quality-contracts/convention-quality-criteria-state-observable-outcomes-51f424cf0193.md
    sha256: 6063963e6984e7efc83b182d105af46c0823318c38da4ad3cfc34699464fbf8e
    reason: >-
      redundant: curated version carries more (>=1/3 failure-case rule)
  - path: memory/agent/proposals/quality-contracts/decision-contract-failures-enter-normal-remediation-routing-611ff55f2995.md
    sha256: 080590b873f76e44dbb54341341f4b2503d9983f12bd5613aacbcc1ce2a93d39
    reason: >-
      redundant: knowledge/integration-verifier.md + spec-plan-intent.md
  - path: memory/agent/proposals/quality-contracts/decision-plan-quality-contracts-augment-baseline-verification-9e7118808315.md
    sha256: a58854c1ca5864cc7c368fd48a7956b661f481f03ce1088e1e9a6dd8e8acd4c2
    reason: >-
      weak: truism once the tiered ladder is curated
  - path: memory/agent/proposals/quality-contracts/decision-quality-contracts-live-with-the-plan-874d7a794448.md
    sha256: 4697dec85a731e2302d2ab3a7e5bf4e11a82cf3fd560bba6635deea7c958f229
    reason: >-
      redundant: stated across forge-lifecycle, integration-verifier, artifact-format-redesign
  - path: memory/agent/proposals/quality-contracts/trade-off-convention-based-contracts-avoid-schema-overhead-e4ca30aafbb1.md
    sha256: 34531ef9d4c778bf40e19dc36fc00586228d4e8e24e1cb6c4dbb3fa4393cd027
    reason: >-
      superseded format: only the schema-avoidance framing was new
  - path: memory/agent/proposals/dialogic-planner/convention-product-framing-and-engineering-design-have-separate-owners-179d7edfdf8b.md
    sha256: 54cfe43545e92650861e862cfe271d6ed386911bb9b2d7fac3692051c6164851
    reason: >-
      redundant: the curated three-route planning router encodes the split
  - path: memory/agent/proposals/dialogic-planner/decision-order-delivery-design-as-structure-behaviors-then-tasks-d9c9d0b4e4b3.md
    sha256: 26d563fcbf0bfbfeec26062155cfb18a57ad8423d68a136afd266e3db98c57e2
    reason: >-
      redundant + stale premise: curated in artifact-format-redesign atomics; no tdd-planner agent exists
  - path: memory/agent/proposals/dialogic-planner/decision-review-the-final-planning-artifact-before-execution-1815e1f855c5.md
    sha256: 77da4d73ae36391e3a72db825f03b7f8ecc5196a3674f23e5765d1c3e7bcd198
    reason: >-
      thin: guarded multi-planning-stage situation no longer exists in shipped chains
  - path: memory/agent/proposals/dialogic-planner/trade-off-defer-planner-memory-reads-until-retrieval-is-selective-c0a20fbee6ab.md
    sha256: a59a0d602521aa1ca29e9ca07a6b82e5399e0f4c8d226d1db8c7677a7911df0c
    reason: >-
      resolved: the awaited selective retrieval shipped (memory-interface) and is curated
  - path: memory/agent/proposals/analysis-capabilities/convention-distinguish-unavailable-support-from-attempted-execution-failure-5f76fa3cd9f6.md
    sha256: 7eb4b68be481a488174a3cc1407c8bc460ae154f6ba88658bb69578148dace14
    reason: >-
      redundant: stated across all three later analysis narratives
  - path: memory/agent/proposals/analysis-capabilities/decision-keep-capability-contracts-inward-and-provider-i-o-at-the-edge-f8a26fe54361.md
    sha256: cb53caffc376e1e6c7e5d702968e202ba68601a55c6e5e269bdb2f842dbe83e5
    reason: >-
      redundant: curated verbatim in analysis-capability-runtime.md
  - path: memory/agent/proposals/analysis-capabilities/decision-verdicts-belong-only-to-verdict-bearing-result-kinds-baba5126c16b.md
    sha256: 82d712bac59179eb15ae1358d93a98466ce52b759b9cfe0fbbeab379501a0810
    reason: >-
      redundant: D-013, curated three times incl. type-level enforcement
  - path: memory/agent/proposals/ruby-rails-skills/convention-reference-documents-are-private-assets-of-one-parent-skill-0c88c64d420c.md
    sha256: d77b147b416c9c8003cf01b0bd43fb26e390eca532ec8531e1a497add385a65e
    reason: >-
      weak: skill-writing already mandates it; additions are minor mechanics
  - path: memory/agent/proposals/roadmap-system/convention-roadmap-location-encodes-item-status-874717a06386.md
    sha256: 0510bcb2708daed0b15a6f314ce12bc0d99d2d019e868a6a4728497e5044074a
    reason: >-
      stale: Now/Next/Later horizon model no longer exists; live clauses are in the roadmap skill
  - path: memory/agent/proposals/roadmap-system/convention-size-each-roadmap-item-to-one-planning-unit-d0fc6eb8e2e2.md
    sha256: 70d0d8016af4f02860133369fe962a8d3e09171eb1d11d6360dac157f49cfb3c
    reason: >-
      redundant: verbatim restatement of the roadmap skill's Granularity section
  - path: memory/agent/proposals/roadmap-system/decision-humans-own-priority-agents-maintain-lifecycle-state-d001b0a8e4e8.md
    sha256: 1353baedf464548e012122fd86672b9fc0ca478c79fe87082f1f32bce72c89e0
    reason: >-
      stale: lifecycle half false today; priority half already procedural in the skill
  - path: memory/agent/proposals/roadmap-system/decision-keep-in-flight-work-visible-until-archival-completes-61e9a76e97ed.md
    sha256: 26a36a297467bd9de00cbcfb5fb277595d31b1e709e49e18e6279b27b7bf5a14
    reason: >-
      contradicted: shipped procedure removes the item when the plan is created
  - path: memory/agent/proposals/roadmap-system/decision-use-priority-horizons-instead-of-sequential-phases-d63f0d28bb32.md
    sha256: d65ecef7de60083a2e0f240c8e2a972eac537c0aaee23ed3b17e1662610c0917
    reason: >-
      stale: design rationale for a retired structure
  - path: memory/agent/proposals/fallow-temp-exceptions-cleanup/decision-classify-static-analysis-exceptions-by-intent-before-removal-5eb5be411728.md
    sha256: 7f2057104296d878b2a740fb346039c6a41a661efdae3f2328ba76ca5467d460
    reason: >-
      redundant: docs/fallow-exceptions.md states it more precisely
  - path: memory/agent/proposals/observability/convention-maintain-a-canonical-framework-capability-reference-05f31d318852.md
    sha256: be560343462431791d84244adf8eb9066363d031704300304d3ac0b04a789ad0
    reason: >-
      redundant: restates the shipped pi skill's upkeep policy (AGENTS.md)
  - path: memory/agent/proposals/package-system/convention-order-domain-sources-from-stable-baseline-to-ephemeral-override-108b23aaeeac.md
    sha256: c21f946abbd1a3dcb283c97c21bccb1088e12b612fa8f67a0aabb5b0cd70c452
    reason: >-
      redundant: knowledge/domain-eject-and-tiers.md (same order, 7 named tiers)
---

# Knowledge surface — rejection round (drops)

## Decision

Executes the 33 `drop` dispositions from the ratified 2026-08-27 table. Each
entry records the file's digest at rejection and the reason (redundant with a
named curated record, superseded, stale, or too weak for an index slot), then
the file is deleted. Rejection is the recorded exit path approved alongside
the table's ratification; consolidation is lossy by design
(knowledge-and-memory.md section 7). Executed by the session agent on the
owner's explicit ratification.
