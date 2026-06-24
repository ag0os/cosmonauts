---
id: TASK-400
title: Thread caller-domain visibility through spawn_agent and chain_run
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:2'
  - domains
  - orchestration
  - internal-visibility
  - 'plan:domain-authoring'
dependencies: []
createdAt: '2026-06-24T15:00:59.752Z'
updatedAt: '2026-06-24T15:09:59.875Z'
---

## Description

Integration verification finding I-001 for plan domain-authoring. Consuming-agent orchestration paths do not consistently pass the caller's domain into binding/public-surface checks. `spawn_agent` resolves caller/target using runtime.domainContext instead of the caller definition's owning domain, and `chain_run` uses runtime.domainContext without extracting caller identity. This can allow a cross-domain caller in a session whose default domain context matches the target domain to resolve agents named in another domain's `manifest.internal.agents`. Keep default resolution role separate from requester/consumer domain: use runtime.domainContext for unqualified default-role resolution, but use callerDef.domain as requesterDomain for internal visibility checks.

<!-- AC:BEGIN -->
- [x] #1 A non-owner caller cannot spawn an agent named in another domain's `manifest.internal.agents` even when `runtime.domainContext` equals the target domain role.
- [x] #2 `chain_run` uses the caller domain for internal-agent visibility diagnostics while preserving requested-vs-resolved binding references for execution and authorization.
- [x] #3 Regression tests cover spawn_agent and chain_run internal-agent denial with a non-owner caller and target-domain default context.
- [x] #4 Existing requested-vs-resolved binding authorization behavior and public same-domain access continue to pass.
<!-- AC:END -->

## Implementation Notes

Implemented caller-domain visibility threading for spawn_agent and chain_run. runtime.domainContext remains the default role-resolution context, while callerDef.domain is passed as requesterDomain for internal-agent visibility checks. Added regression coverage for cross-domain denial and same-domain internal access preservation.
