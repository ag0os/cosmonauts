---
type: trade-off
title: Package variants may share one domain identity
description: >-
  A minimal and full package can expose the same domain ID to provide a drop-in
  upgrade, at the cost of requiring deterministic precedence.
resource: >-
  knowledge/framework-extraction/trade-off-package-variants-may-share-one-domain-identity-f55497c26ee4.md
tags:
  - domains
  - identity
  - package-variants
  - precedence
timestamp: '2026-08-21T14:50:31.206Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/spec.md
date: '2026-08-21T14:50:31.206Z'
---
Let package variants expose the same logical domain identity when they are intended as substitutes rather than composable domains. This keeps project configuration stable when users move from a starter package to the full package. The cost is that overlap must have an explicit winner or replacement rule; otherwise installing both can merge incompatible partial definitions or make resolution order accidental.
