---
type: gotcha
title: Built-in infrastructure domains do not satisfy installation guards
description: >-
  A built-in executive domain can make a naive “any domain exists” check pass
  even when no usable workload domain is installed.
resource: >-
  knowledge/main-domain-and-cosmo-rename/gotcha-built-in-infrastructure-domains-do-not-satisfy-installation-guards-d6290944ea4b.md
tags:
  - cli
  - domains
  - guards
  - installation
timestamp: '2026-05-04T20:40:37.749Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/main-domain-and-cosmo-rename/worker-51279a14-29af-4070-ae8d-0078ed5c74ae.transcript.md
date: '2026-05-04T20:40:37.749Z'
---
When a runtime always discovers infrastructure domains, installation guards must explicitly exclude them. Otherwise adding a built-in main or shared domain silently disables the fresh-install guard and routes users into an executive that has no workload specialists available. Define the excluded infrastructure set centrally and test both infrastructure-only and workload-domain-present cases.
