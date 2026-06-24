---
id: TASK-386
title: Route bundled root domains and migrate bundled coding layout
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-385
createdAt: '2026-06-23T21:13:46.721Z'
updatedAt: '2026-06-23T21:24:46.922Z'
---

## Description

Complete Implementation Order step 1 for first-party bundled packages after package-root source semantics exist. Collapse the bundled coding package into the `bundled/coding/**` root-domain layout, route bundled package manifests through the same domain-root scanner path as installed packages, and keep the coding domain discoverable in dev mode. This task owns B-016 and must place the exact behavior marker near its executable test.

<!-- AC:BEGIN -->
- [x] #1 B-016 framework dev-mode bundled package discovery routes `bundled/coding` through manifest-aware `domain-root` source logic and keeps `coding/cody` available, proven in `tests/packages/scanner.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-016`.
- [x] #2 The first-party bundled coding package declares a single root domain with `path: "."` and has no active runtime/test/doc references to the former nested bundled coding layout.
- [x] #3 The migrated bundled coding TypeScript files resolve their relative imports correctly under the root-domain layout.
<!-- AC:END -->
