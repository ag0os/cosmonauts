---
type: trade-off
title: Delete demonstrably unused packages without migration machinery
description: >-
  When an obsolete package has no users, direct removal can be safer than
  permanent detection and migration code.
resource: >-
  knowledge/main-domain-and-cosmo-rename/trade-off-delete-demonstrably-unused-packages-without-migration-machinery-6f4dce89bd04.md
tags:
  - deprecation
  - maintenance
  - migration
  - packages
timestamp: '2026-05-04T20:29:03.334Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/main-domain-and-cosmo-rename/worker-2a9e789b-3867-459f-84af-8d2ddeee5826.transcript.md
date: '2026-05-04T20:29:03.334Z'
---
If usage has been explicitly established as zero, remove the package directory and catalog entry without runtime detection, warnings, automatic migration, or ignore flags. The accepted cost is that unmanaged preinstalled copies may remain on user machines. Record the usage assumption and verify the retired package is absent; do not create maintenance code for a population that does not exist.
