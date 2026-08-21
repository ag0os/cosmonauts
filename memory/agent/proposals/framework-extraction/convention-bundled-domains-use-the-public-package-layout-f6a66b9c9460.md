---
type: convention
title: Bundled domains use the public package layout
description: >-
  First-party bundled domains must have the same manifest and directory
  structure as user-created installable packages.
resource: >-
  knowledge/framework-extraction/convention-bundled-domains-use-the-public-package-layout-f6a66b9c9460.md
tags:
  - bundled-domains
  - extension-contract
  - layout
  - packages
timestamp: '2026-08-21T14:50:31.203Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/spec.md
date: '2026-08-21T14:50:31.203Z'
---
Do not create a privileged on-disk format for first-party domain content. A bundled domain should be a complete package with the public manifest and domain paths expected by the normal installer, validator, scanner, and resolver. Keeping bundled and external packages structurally identical ensures the bundled catalog exercises the public extension contract instead of a private integration path.
