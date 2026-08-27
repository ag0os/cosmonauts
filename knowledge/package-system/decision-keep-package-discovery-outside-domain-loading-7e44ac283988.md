---
type: decision
title: Keep package discovery outside domain loading
description: >-
  Package scanners translate installation details into generic ordered domain
  sources so domain loading stays independent of package stores and acquisition
  mechanisms.
resource: >-
  knowledge/package-system/decision-keep-package-discovery-outside-domain-loading-7e44ac283988.md
tags:
  - architecture
  - dependency-direction
  - domains
  - packages
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Represent every provider as a generic domain-source descriptor containing its location, origin, shape, and precedence. Package scanning owns knowledge of built-ins, stores, and session-only inputs; domain loading accepts only those descriptors. This dependency direction prevents package installation concerns from leaking into domain behavior and allows new acquisition sources to be added without changing the loader or its consumers.
