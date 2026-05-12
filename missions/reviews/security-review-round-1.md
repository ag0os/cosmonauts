# Security Review: round 1

## Overall

incorrect

## Assessment

The API-key filtering, subprocess spawning, temp prompt materialization, and generated-entry string escaping are implemented without obvious key leakage or shell injection. One path confinement check for package prompt files is bypassable via symlinks, which can cause unintended local file contents to be embedded in exported binaries.

## Findings

- id: S-001
  dimension: security
  severity: low
  priority: P3
  confidence: 0.82
  complexity: simple
  file: lib/agent-packages/definition.ts:110-112,237-263
  summary: |
    `loadAgentPackageDefinition()` rejects absolute `prompt.path` values and `..` traversal by resolving the string path under the package definition directory, but it never canonicalizes the resolved path or rejects symlinks before `readPackagePrompt()` reads it. A package directory can contain `prompts/system.md` as a symlink to a file outside the package (for example a private key); `prompt.path: "prompts/system.md"` passes the current check and the target file is read and embedded into the exported binary.
  suggestedFix: Canonicalize the definition directory and prompt file with `realpath` before reading, then require the real prompt path to remain under the real definition directory (or reject symlinked prompt files).
