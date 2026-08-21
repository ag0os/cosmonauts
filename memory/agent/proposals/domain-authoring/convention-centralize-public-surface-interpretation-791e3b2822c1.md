---
type: convention
title: Centralize public-surface interpretation
description: >-
  All cross-domain agent, skill, and chain access must consult one domain
  visibility policy boundary.
resource: >-
  knowledge/domain-authoring/convention-centralize-public-surface-interpretation-791e3b2822c1.md
tags:
  - architecture
  - dependency-boundary
  - domains
  - visibility
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Place interpretation of provider visibility behind one focused domain API, and make agent resolution, chain listing/resolution, and skill catalog construction depend on it. Keep this policy module independent of filesystems and user interfaces. Duplicating visibility checks in consumers invites semantic drift, such as hiding unnamed assets in one path while exposing explicitly internal assets in another.
