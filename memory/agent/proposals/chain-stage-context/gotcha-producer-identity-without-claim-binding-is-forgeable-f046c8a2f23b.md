---
type: gotcha
title: Producer identity without claim binding is forgeable
description: >-
  Correlating durable evidence to a successful producer does not prove that
  producer authorized the target named by the evidence.
resource: >-
  knowledge/chain-stage-context/gotcha-producer-identity-without-claim-binding-is-forgeable-f046c8a2f23b.md
tags:
  - authorization
  - correlation
  - durable-runtime
  - event-replay
  - security
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/chain-stage-context/codex-review.md
date: '2026-09-10T00:00:00.000Z'
---
A persisted authorization claim can reuse the identity and topology index of a previously successful producer while substituting a different target. Correlation must bind producer, claim, and target—not merely confirm that the producer step existed and succeeded. When a durable loop-free step executes once, treat its authorization as consumable once during event replay; reject later claims that reuse that producer identity. Explicitly validate the evidence shape and test forged target and reused-producer cases.
