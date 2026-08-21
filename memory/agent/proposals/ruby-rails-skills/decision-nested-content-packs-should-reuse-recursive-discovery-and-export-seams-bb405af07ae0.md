---
type: decision
title: Nested content packs should reuse recursive discovery and export seams
description: >-
  Add nested skill packs as content-only directories when existing discovery and
  export mechanisms already recurse through complete skill directories.
resource: >-
  knowledge/ruby-rails-skills/decision-nested-content-packs-should-reuse-recursive-discovery-and-export-seams-bb405af07ae0.md
tags:
  - architecture
  - content-packs
  - discovery
  - export
  - skills
timestamp: '2026-04-23T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/plan.md
date: '2026-04-23T00:00:00.000Z'
---
Before changing runtime code for a nested content pack, verify two integration contracts: discovery recursively finds each leaf entry file, and export copies the entire containing directory. When both contracts hold, add the pack entirely under the established content root and rely on existing integration seams. This avoids unnecessary loader changes while ensuring subordinate references remain available after export.
