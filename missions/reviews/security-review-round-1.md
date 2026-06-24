# Security Review: round 1

## Overall

incorrect

## Assessment

The domain authoring diff adds the intended `path: "."` special case, but non-root package domain paths are still accepted as arbitrary relative strings. A malicious or malformed package can use `..` path components to make the scanner expose directories outside the package root, including the package-store parent.

## Findings

- id: SR-001
  priority: P1
  severity: high
  confidence: 0.91
  complexity: simple
  dimensions: security|correctness
  location: lib/packages/manifest.ts:145-152, lib/packages/installer.ts:277-291, lib/packages/scanner.ts:170-193
  summary: |
    `cosmonauts.json` domain entries only require `path` to be a string, and install validation checks `stat(join(sourceDir, domain.path))` without rejecting absolute paths or `..` traversal. Later, `addPackageSources` computes `join(pkg.installPath, domain.path)` and exposes `dirname(...)` as a `domains-dir` source. A package declaring a non-root path such as `../other-package/domain` or `../some-store-entry` can therefore make runtime domain loading scan outside the installed package root; in the store this can become the store parent, exposing sibling packages/domains that were not declared by the package being scanned.
  suggestedFix: Validate every non-`.` domain path at manifest/install time as a normalized relative path confined under the package root, and reject absolute paths or any path that escapes the package directory before adding scanner sources.
