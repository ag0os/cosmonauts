# Security Review: round 1

## Overall

incorrect

## Assessment

The diff adds several reachable security weaknesses at the project-controlled artifact boundary: unsafe live-tool probing, two algorithmic denial-of-service paths, conformance-check bypasses, and unsanitized terminal output. Test-file references remain lexically and canonically confined to the project root, and no new dependency or secret-handling issue was introduced.

## Findings

- id: SR-001
  dimension: blast-radius
  priority: P1
  severity: medium
  confidence: 0.93
  complexity: simple
  title: "Read-only live probes can execute project-controlled tool configuration"
  files: bundled/coding/prompts/plan-reviewer.md, bundled/coding/agents/plan-reviewer.ts
  lineRange: bundled/coding/prompts/plan-reviewer.md:26; bundled/coding/agents/plan-reviewer.ts:14
  summary: |
    The new reviewer instruction mandates live invocations of external tools whenever a plan wraps one. The plan-reviewer has the `coding` tool preset, so it can execute shell commands; calling a tool "read-only" only describes intended filesystem effects and does not prevent the tool from loading executable project configuration, plugins, or startup hooks. A malicious project reviewed by an autonomous chain can therefore cause a probe such as config discovery or test collection to execute project-controlled code with the reviewer's process privileges, without a consent gate.
  evidence: |
    `bundled/coding/prompts/plan-reviewer.md:26` requires live invocations but only says to keep them within "read-only discipline." `bundled/coding/agents/plan-reviewer.ts:14` grants the reviewer the `coding` tool preset rather than a no-execution tool set. Many external tools execute repository-local JavaScript/Python plugins or configuration even for nominally observational flags, so the changed prompt creates a direct path from a project-controlled plan to command execution.
  suggestedFix: Require probes to avoid all project configuration/plugin loading, and require explicit user consent or a sandbox when a non-executing probe cannot be guaranteed.

- id: SR-002
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Wildcard file pairing regex permits catastrophic backtracking"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: lib/artifacts/behavior-conformance.ts:613-617,636-642
  summary: |
    A project-controlled Seam or Test path is converted into a dynamic regular expression where every `*` becomes an independently quantified character-class group. Adjacent or repeated wildcards create highly ambiguous matches. Running `cosmonauts plan check-artifacts <slug>` on a malicious plan can therefore consume a CPU core for an attacker-controlled duration and stall local or CI conformance gates.
  evidence: |
    `looksLikeProjectFilePath` accepts arbitrary runs of `*`, and `fileReferenceAppears` expands each one into a `+` quantifier before testing the full Files-to-Change text. Direct branch measurements with the accepted Seam `x.************Z` and a 36-character nonmatching Files-to-Change entry took about 5.0 seconds; 13 wildcards took about 10.8 seconds. The payload is only tens of bytes and scales rapidly.
  suggestedFix: Replace the backtracking dynamic regex with a bounded, non-backtracking glob matcher and reject or normalize pathological wildcard patterns.
  task:
    title: "Make behavior/file pairing resistant to wildcard ReDoS"
    labels: [review-fix]
    acceptanceCriteria:
      - "Pairing preserves the intended literal and wildcard path behavior without constructing an attacker-amplifiable backtracking regex."
      - "A regression test with repeated and separated wildcards plus a long nonmatch completes within a fixed short timeout."

- id: SR-003
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Any date in a decision block falsely satisfies an undated Supersedes pointer"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: lib/artifacts/behavior-conformance.ts:498-512
  summary: |
    The supersession validator checks the entire decision block for an ISO date rather than checking the `Supersedes:` pointer itself. A normal `Decided by: ..., 2026-07-28` line therefore makes an undated `Supersedes: D-001` pass. Project-controlled plans can bypass the new blocking evidence-integrity check while presenting an apparently conformant result.
  evidence: |
    Lines 509-512 join the whole decision block and accept it when `ISO_DATE_REGEX` matches anywhere. On this branch, a decision containing `Decided by: human, 2026-07-28` followed by `Supersedes: D-001` produced no `undated-supersession` issue. The added test avoids this realistic case by omitting the date from the entire decision block.
  suggestedFix: Require an ISO date in the matched `Supersedes:` value (or its explicitly defined pointer syntax), not elsewhere in the decision entry.

- id: SR-004
  dimension: input-validation
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Quoted Markdown can bless fake decisions, bypass citations, or falsely block a plan"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: lib/artifacts/behavior-conformance.ts:419-432,448-459,525-527
  summary: |
    The D-003 policy is implemented with a boolean fence toggle and a single-backtick regex rather than Markdown delimiter semantics. Decision declarations are collected from completely unmasked Decision Log text. A fenced example can consequently declare a fake D-ID that resolves a real citation, while double-backtick spans and nested/longer fences can falsely trigger issues or leave the scanner masking real prose after a valid closing fence. This lets project-controlled text evade blocking checks or deny valid plans.
  evidence: |
    A fenced `- **D-999 - Quoted example**` inside `## Decision Log`, followed by a real prose citation to `D-999`, produced no unresolved-citation issue because lines 448-454 collect declarations before masking. A `D-998` span delimited by two backticks on each side produced an unresolved issue because the single-backtick-span regex masks only the empty outer pairs. With an outer four-backtick fence containing a three-backtick line, the checker reported the citation inside the code block and missed a real citation after the valid four-backtick close because every fence-looking line merely toggles one boolean.
  suggestedFix: Use one Markdown-aware masking pass for both declarations and references, tracking inline/fence delimiter character and run length according to fenced-code and code-span rules.
  task:
    title: "Harden quoted-text masking for decision conformance scans"
    labels: [review-fix]
    acceptanceCriteria:
      - "Quoted decision declarations cannot satisfy citations in real prose, and quoted Supersedes lines cannot create blocking issues."
      - "Single/multiple-backtick spans, backtick/tilde fences, longer fences containing shorter runs, and unmatched fences have explicit regression cases matching Markdown semantics."
      - "The same masked representation is used for decision declarations, citations, and supersession annotations."

- id: SR-005
  dimension: input-validation
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "Supersession validation performs quadratic rescans and block copies"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: lib/artifacts/behavior-conformance.ts:491-511
  summary: |
    For every project-controlled `Supersedes:` line, the validator rescans the Decision Log with `findIndex`, then slices and joins a decision block. A plan containing many such lines drives quadratic CPU and allocation growth when checked through the CLI, allowing a malicious repository or pull request to stall artifact validation.
  evidence: |
    The loop at lines 491-511 repeats a full `findIndex` and potentially a full-section `slice().join()` for each matching line. Direct branch measurements took about 49 ms for 1,000 lines, 576 ms for 4,000, 2.2 seconds for 8,000, and 5.4 seconds for 12,000, demonstrating quadratic growth.
  suggestedFix: Parse decision boundaries and their date state in one forward pass, validating each Supersedes line without rescanning or rebuilding its block.

- id: SR-006
  dimension: injection
  priority: P3
  severity: low
  confidence: 0.94
  complexity: simple
  title: "New diagnostics emit project-controlled control sequences to terminals"
  files: lib/artifacts/behavior-conformance.ts, cli/plans/commands/check-artifacts.ts
  lineRange: lib/artifacts/behavior-conformance.ts:516-521,599-606,664-671; cli/plans/commands/check-artifacts.ts:173-186,198-210
  summary: |
    The new supersession, pairing, and duplicate-marker issues copy project-controlled annotation, path, and marker text into issue fields and messages. Human and plain renderers concatenate those values directly to stdout without removing control characters. A malicious plan checked in an interactive terminal can forge or hide diagnostics and, on supporting terminals, emit OSC operations such as clipboard writes; plain output can also be structurally spoofed.
  evidence: |
    The new issue producers interpolate `match[1]`, `reference.path`, and `marker` without normalization. `renderPlainIssue` and `renderHumanIssue` then concatenate `actual`, `path`, `marker`, and `message` directly, while only JSON mode receives JSON escaping. Plan fields are line-oriented but still admit ESC, BEL, lone carriage returns, and other terminal controls.
  suggestedFix: Strip or visibly escape terminal control characters in human/plain output while preserving structured values through JSON escaping.
