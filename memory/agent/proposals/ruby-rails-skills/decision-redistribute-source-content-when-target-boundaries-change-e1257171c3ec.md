---
type: decision
title: Redistribute source content when target boundaries change
description: >-
  When adaptation changes ownership boundaries, move useful guidance to the
  owning target rather than retaining it in the wrong layer or silently deleting
  it.
resource: >-
  knowledge/ruby-rails-skills/decision-redistribute-source-content-when-target-boundaries-change-e1257171c3ec.md
tags:
  - boundaries
  - content-migration
  - ownership
  - skills
  - traceability
timestamp: '2026-08-21T15:01:50.724Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/spec.md
date: '2026-08-21T15:01:50.724Z'
---
Maintain an explicit source-section-to-target mapping for every section that conflicts with the target architecture. Remove the section from the non-owning skill, preserve its substance in the correct domain skill, and record deliberate deferrals to an existing canonical skill. Review both the source and destination so that boundary cleanup cannot masquerade as content loss.
