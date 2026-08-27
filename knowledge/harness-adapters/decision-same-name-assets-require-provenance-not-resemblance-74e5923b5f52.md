---
type: decision
title: 'Same-name assets require provenance, not resemblance'
description: >-
  Name, frontmatter, or byte resemblance cannot authorize adoption of an
  unmanaged target.
resource: >-
  knowledge/harness-adapters/decision-same-name-assets-require-provenance-not-resemblance-74e5923b5f52.md
tags:
  - conflicts
  - harness-adapters
  - provenance
  - safety
timestamp: '2026-08-25T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/spec.md
date: '2026-08-25T00:00:00.000Z'
---
Treat an existing same-output target as a permanent conflict unless its origin can be traced to the selected descriptor. Preserve its raw bytes and unknown metadata, report it as foreign or untraceable, and provide no force-adopt path. A same-named target may be richer output owned by another tool; replacing it based on naming or partial metadata can destroy user state while appearing to be a routine migration.
