---
type: gotcha
title: A root-domain package needs an exact source kind
description: >-
  Never represent a package-root domain by scanning the package's parent as a
  directory of domains.
resource: >-
  knowledge/domain-authoring/gotcha-a-root-domain-package-needs-an-exact-source-kind-0ea8c48c4ec3.md
tags:
  - domains
  - filesystem-boundary
  - loading
  - packages
  - security
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Distinguish a source whose path is one exact domain root from a source whose children are domain roots. A package manifest may point to its own root only when that is its sole domain; mixed root-and-subfolder declarations must be rejected. Otherwise a loader may scan the package-store parent and accidentally expose sibling packages as domains. Route installed and development-bundled packages through the same manifest-aware source conversion.
