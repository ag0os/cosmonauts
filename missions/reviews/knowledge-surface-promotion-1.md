---
kind: knowledge-surface-promotion
plan: knowledge-surface
round: 1
promotedBy: Agustin Calabrese
promotedAt: '2026-08-24T00:00:00Z'
sourceReviewIndexDigest: e61eaf52d7ca488657323c06e6f6f03463447265158a6eaf114a0faf25e3a6b4
promotedCount: 9
selection: transcript-sourced
promotions:
  - from: memory/agent/proposals/driver-primitives/gotcha-event-isolation-requires-both-type-namespaces-and-session-correlation-9371d61b699f.md
    to: knowledge/driver-primitives/gotcha-event-isolation-requires-both-type-namespaces-and-session-correlation-9371d61b699f.md
    sha256: 66efae3ae9e3d2d5e1009b1b54b68e9ce74db632b683dd9a4fc77e0b89b48ac5
  - from: memory/agent/proposals/external-agent-orchestration/convention-single-source-internal-and-packaged-skill-filtering-e7ef7b9e0e45.md
    to: knowledge/external-agent-orchestration/convention-single-source-internal-and-packaged-skill-filtering-e7ef7b9e0e45.md
    sha256: b197087e4c89357c49484f323feeb0a596d40da142d069ee2a2ccb646dfa5270
  - from: memory/agent/proposals/external-agent-orchestration/gotcha-mocked-compiler-tests-can-miss-generated-entry-failures-363a54d47115.md
    to: knowledge/external-agent-orchestration/gotcha-mocked-compiler-tests-can-miss-generated-entry-failures-363a54d47115.md
    sha256: ba049247444dc216b5dd8f38a07523e6e0abf3a58f9872269e350eae964cd034
  - from: memory/agent/proposals/external-backends-and-cli/gotcha-agent-renames-can-invalidate-delegated-domain-authorization-a9c088e63be1.md
    to: knowledge/external-backends-and-cli/gotcha-agent-renames-can-invalidate-delegated-domain-authorization-a9c088e63be1.md
    sha256: 4ba2c8895f19633c8e5bef764d4ed2adcdd3c45864347a48d02d5974eb0dd3c7
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/convention-scope-persistent-lead-sessions-by-domain-19c3d4cab205.md
    to: knowledge/main-domain-and-cosmo-rename/convention-scope-persistent-lead-sessions-by-domain-19c3d4cab205.md
    sha256: 43ccfe71661f37e8c3c0b37c4993b828a2f660aaad58b2537ca385067b42c991
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/decision-attach-rename-guidance-at-the-role-resolution-boundary-a667dc58b228.md
    to: knowledge/main-domain-and-cosmo-rename/decision-attach-rename-guidance-at-the-role-resolution-boundary-a667dc58b228.md
    sha256: 489c46d0652efeb27dfb4ce051effb496fedab516f8e2bc509c7e57fa782fd43
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/decision-resolve-cli-defaults-from-domain-manifests-7e7d35be13b9.md
    to: knowledge/main-domain-and-cosmo-rename/decision-resolve-cli-defaults-from-domain-manifests-7e7d35be13b9.md
    sha256: 0c0a0cbb9134b7849a674714ed0c40ac40ab329f57706361247e8f30069029f9
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/gotcha-built-in-infrastructure-domains-do-not-satisfy-installation-guards-d6290944ea4b.md
    to: knowledge/main-domain-and-cosmo-rename/gotcha-built-in-infrastructure-domains-do-not-satisfy-installation-guards-d6290944ea4b.md
    sha256: d4e7dc9f52497c77438c29d82131294d5342c56a4944aac74d4082e8dabab254
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/trade-off-delete-demonstrably-unused-packages-without-migration-machinery-6f4dce89bd04.md
    to: knowledge/main-domain-and-cosmo-rename/trade-off-delete-demonstrably-unused-packages-without-migration-machinery-6f4dce89bd04.md
    sha256: 7cf528d7aadf5372eecbc1b00a6b3bd2cfe7605bcd538c58bcc2c29484b0a03a
---

# Knowledge surface — promotion round 1

## Decision

The project owner promoted 9 records from the approved Stage 7A backfill
batch into curated `knowledge/`. Promotion is a human act (INV-1); this record is
its audit trail.

## Selection

The promoted set is exactly the transcript-sourced subset of the 164 approved
proposals. The other 155 derive from `plan.md` and other plan-directory documents
that remain readable in the archive, so they restate recorded design intent rather
than carrying session-only lessons. They stay proposals; this is not a rejection.

## Integrity

Promotion moved bytes unchanged. Each `sha256` above is the digest recorded for that
path in `memory/agent/proposals/backfill-review.json`, verified against the file
before the move and again at its destination. The review index is deliberately
left immutable: it is digest-bound to the Stage 7B approval artifact, so amending it
would void that binding. A promoted proposal is therefore still described by the
index, at its new location.

## Note on the guard this required

The shipped B-010 test asserted that no file under `knowledge/` carries
`writer: coding/distiller`, and that the review index path set equals the live
proposals directory. Both froze the post-backfill state and would fail on any
promotion — while the plan states a proposal "exits only by human promotion or
rejection/deletion". The assertions are now promotion-aware: a distiller-authored
record may sit under `knowledge/` only when a promotion record lists it, and an
indexed proposal must exist either at its proposals path or at its promoted path
with the same digest. That makes the guard stronger — it now also proves promotion
preserves bytes and is recorded.
