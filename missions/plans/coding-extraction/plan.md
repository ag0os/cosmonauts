---
title: Extract the coding domain to its own installable repo (domains S2)
status: active
createdAt: '2026-06-25T00:00:00.000Z'
updatedAt: '2026-06-26T14:10:24.000Z'
---

## Summary

Externalize the `coding` domain from the framework repo into its own
independently-developed, install-on-demand package — the first real consumer of
the domain-extraction vision. The framework npm tarball ships only framework +
`shared` + `main`; `coding` installs from the catalog/git, and this repo
dev-loops it via `--link`. Builds directly on the now-portable `coding` package
produced by the archived `domain-authoring` plan (single-domain root, framework
prompts separated, framework/domain boundary established).

This plan is **spec-ready and awaits planner design.** It is the `S2 — Extract
coding` slice of `missions/architecture/domains.md`.

## Scope

Product-side scope: cleanly separate `coding` into its own repo and make it
installable, without regressing this repo's own development (which dogfoods
`coding`). Includes the physical move, catalog/packaging changes, the `--link`
dev loop, decoupling the framework's remaining hardcoded `coding` defaults, and
decoupling the test suite from the bundled `coding` domain.

Out: domain routing (S4), the customization override-layer (S3), the
declarative-format migration (S5), domain composition/inheritance, and authoring
new domain content. Distribution model is decided: **install-on-demand** (the
framework does not bundle `coding`).
