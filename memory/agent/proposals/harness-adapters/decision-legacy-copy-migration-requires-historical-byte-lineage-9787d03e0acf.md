---
type: decision
title: Legacy-copy migration requires historical byte lineage
description: >-
  An unmanaged legacy copy is migratable only when its current tree exactly
  matches a render reconstructed from an identified historical source.
resource: >-
  knowledge/harness-adapters/decision-legacy-copy-migration-requires-historical-byte-lineage-9787d03e0acf.md
tags:
  - harness-adapters
  - lineage
  - migration
  - provenance
timestamp: '2026-08-26T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/repo-export-validation-evidence.json
date: '2026-08-26T00:00:00.000Z'
---
Authorize legacy adoption with a one-time proof that binds the historical revision and source path, legacy render digest, current target tree, owner, asset identity, output path, and node shape. Re-read the target under the transaction lock before moving it. An observed current hash alone proves only what is present now, not that the bytes descended from the claimed source, so it cannot safely distinguish stale exports from foreign assets.
