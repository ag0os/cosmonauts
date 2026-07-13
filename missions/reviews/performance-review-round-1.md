# Performance Review: round 1

## Overall

incorrect

## Assessment

The ratified full-store rescans and three-scan playbook-save path are acceptable at the stated dozens-of-records scale; sorting is at most O(r log r), the injected index is capped at 50 records, and the UTF-8 excerpt loops are bounded. The diff nevertheless has one hard 12,000-byte budget escape and two pathological-filesystem costs that are not bounded by the authored-record scale assumption.

## Findings

- id: PR-001
  dimension: scaling
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "Profile metadata can exceed or abort the 12,000-byte injection budget"
  files: domains/shared/extensions/agent-memory/index.ts, lib/memory/okf.ts
  lineRange: domains/shared/extensions/agent-memory/index.ts:492-522; domains/shared/extensions/agent-memory/index.ts:525-561; lib/memory/okf.ts:69-76
  evidence: |
    `buildMemoryContext` returns `contextHeader + profileSection` directly when no note/playbook exists, without measuring it. `formatProfileContext` limits only the body excerpt to 4,000 bytes; it emits the human-authored `timestamp` and path without a framing bound, and an oversized-profile path appears twice. `parseAuthoredRecord` accepts a timestamp of any string length. With a 13,000-byte valid timestamp, the profile-only branch produces a 13,213-byte hidden message. If one index record is also present, the profile section becomes the non-truncatable `header`; `truncateWithFooter` cannot fit it and throws instead of returning context.
  impact: |
    A valid human edit can violate AC-010's hard combined budget or make `before_agent_start` fail. Cost grows with authored metadata/path bytes rather than the 12,000-byte ceiling, so the body bound does not protect the turn.
  suggestedFix: Apply the combined byte-budget algorithm to profile-only output and make profile framing itself budget-aware before reserving profile/index notices.
  task:
    title: "Enforce the combined budget for oversized profile framing"
    labels: [review-fix]
    acceptanceCriteria:
      - "Profile-only and profile-plus-index contexts with oversized human metadata remain valid UTF-8, do not throw, and are at most 12,000 bytes."
      - "Required profile truncation/recall guidance survives any metadata or index truncation."

- id: PR-002
  dimension: io-hot-path
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Direct-child playbook discovery recursively walks and repeatedly sorts rejected subtrees"
  files: lib/memory/markdown-store.ts
  lineRange: lib/memory/markdown-store.ts:446-459; lib/memory/markdown-store.ts:599-621
  evidence: |
    `readPlaybookRecords` calls the recursive `listMarkdownFiles` and only rejects nested paths after the full subtree has been enumerated. The helper sorts each recursive result before its parent sorts the accumulated paths again. For F files across depth D, discovery can cost O(F × D log F) path work and O(F) warnings even though every nested playbook is ineligible; when depth grows with file count, this becomes super-linear. The same work runs on every turn and during index regeneration.
  impact: |
    A wide or deeply nested human-created directory under `playbooks/` can dominate session-start and save I/O independently of the ratified count of valid authored records. This also contradicts the fixed direct-child discovery boundary that should contain the scan.
  suggestedFix: Use shallow discovery for `playbooks/` and warn on a nested directory entry without descending into its subtree.

- id: PR-003
  dimension: io-hot-path
  priority: P3
  severity: low
  confidence: 0.98
  complexity: simple
  title: "Alternate playbook naming performs an unbounded serial stat search"
  files: lib/memory/markdown-store.ts
  lineRange: lib/memory/markdown-store.ts:657-675
  evidence: |
    `firstAvailablePlaybookPath` starts at suffix 2 and awaits one `lstat` per occupied candidate in an unbounded `while (true)`. Choosing an alternate filename is therefore O(k) sequential filesystem round trips for k consecutive occupied suffixes, including invalid files or directories that are not part of the valid authored-record count.
  impact: |
    Pathological authored directories can turn one playbook save into thousands of serialized syscalls after the store has already scanned the directory. Normal dozens-scale stores are unaffected, but there is no fail-safe for hostile or accidentally dense suffix ranges.
  suggestedFix: Select the first free suffix from one bounded directory listing, or stop with a clear failure after a defined maximum number of attempts.
