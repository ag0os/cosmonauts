# Security Review: round 3

## Overall

correct

## Assessment

At `02d5bd45dd41060c9fe085a465177cb9d247019d`, both prior executable-frontmatter paths reject malicious input before an executable `gray-matter` engine can run. I found no additional reachable security defect in the scoped Stage 3 reachability, task dependency, selection, CLI, or archive changes; the range adds no dependency or secret-handling change.

## Prior Findings

- id: SR-001
  status: resolved
  evidence: |
    `scripts/check-reachability.ts:25-33` now accepts only an ordinary, `yaml`, or `yml` opening delimiter, reconstructs the opening without its language tag, and calls `matter` with `language: "yaml"`. `ownerLive` uses only this parser at `scripts/check-reachability.ts:71-83`. Thus `---js\n` and `---js\r\n` are rejected as language `js`, while `---\rjs\n` fails the opening-delimiter match; none reaches gray-matter language autodetection. The shipped-command regressions at `tests/scripts/check-reachability.test.ts:240-260` exercise all three inputs and require both a failing exit and absence of their marker files. The targeted Stage 3 run passed 161/161 tests, including all 34 reachability tests, and `bun run check:reachability` completed successfully with 186/186 runtime library modules reached.

- id: SR-002
  status: resolved
  evidence: |
    `lib/tasks/task-parser.ts:37-45,316-323` normalizes CRLF, rejects every explicit frontmatter language other than `yaml`/`yml`, and performs that check before calling `matter`. The new archived-dependency path reads the matching file and routes it through this parser at `lib/tasks/task-manager.ts:637-642`. The caller-level regression at `tests/tasks/task-manager.test.ts:1091-1106` proves the original archived `---js` payload is rejected without creating its marker. An additional review probe through `TaskManager.listTasks({ ready: true })` verified LF-tagged JS, CRLF-tagged JS, and bare-CR `---\rjs` inputs all reported `unsupported frontmatter language: js` and created no marker.

## Findings

(none)
