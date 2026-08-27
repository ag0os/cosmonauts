---
type: gotcha
title: Published package allowlists must include runtime-loaded content
description: >-
  A global CLI can pass repository tests yet fail after publication if
  dynamically loaded bundled assets are omitted from the package artifact.
resource: >-
  knowledge/framework-extraction/gotcha-published-package-allowlists-must-include-runtime-loaded-content-0db4b160b25d.md
tags:
  - bundled-assets
  - dynamic-loading
  - npm-package
  - publishing
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
When runtime behavior loads non-code trees such as bundled domains, prompts, skills, or manifests, include those trees explicitly in the publication allowlist and verify the packed artifact rather than only the source checkout. Repository tests can conceal omissions because the files exist locally; an install-from-pack smoke test should prove that discovery and loading work from the actual distribution.
