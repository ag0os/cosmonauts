# Integration Report

plan: domain-authoring
overall: incorrect

## Overall Assessment

Prior integration finding I-001 is resolved: `spawn_agent` now keeps `runtime.domainContext` for default-role resolution while passing `callerDef.domain` as the requester domain (`domains/shared/extensions/orchestration/spawn-tool.ts:488-493`), and `chain_run` extracts the caller then passes `callerDef?.domain` into chain parsing (`domains/shared/extensions/orchestration/chain-tool.ts:114-123`). The requested remediation for F-006 is also visible through non-rebinding resolved-target lookup (`lib/orchestration/agent-spawner.ts:170-175`), and the round-2 simple fixes are reflected in bound default-domain chain lookup plus warnings/corrective messages (`cli/run/subcommand.ts:262-279`, `lib/config/loader.ts:86-106`, `lib/packages/installer.ts:252-262`). One B-022/package-validation contract remains incomplete outside the installer path.

## Findings

- id: I-002
  priority: P2
  severity: medium
  confidence: 0.84
  complexity: simple
  contract: B-022 / Design > Package root loading, including bundled dev packages
  files: lib/packages/manifest.ts, lib/packages/scanner.ts
  lineRange: lib/packages/manifest.ts:123-149, lib/packages/scanner.ts:166-194
  summary: The plan requires `path: "."` to be rejected when it is not the only domain in a package, including manifest validation/source scanning so a mixed root-domain package cannot silently enter domain-source routing. `validateDomainsField()` validates shape and path traversal but has no check for a `path: "."` entry coexisting with other domains, and `addPackageSources()` accepts any package record containing both a root entry and subdomain entries by adding both a `domain-root` source and parent `domains-dir` sources. The installer path rejects this shape, but bundled package scanning and any already-present package record still bypass the declared manifest/scanner rejection contract.
  suggestedFix: Move the root-domain exclusivity rule into manifest validation or a shared package-domain validation helper used by manifest loading, installer validation, bundled package loading, and scanner source construction; add B-022 regressions proving `validateManifest()` and `scanDomainSources()` reject or refuse mixed `path: "."` packages rather than emitting sources.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. A package manifest containing `path: "."` plus any other domain entry fails validation before scanner source construction.
      2. `scanDomainSources()` never emits domain sources for a mixed root-domain package from bundled or installed package records.
