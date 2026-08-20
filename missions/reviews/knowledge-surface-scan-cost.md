---
kind: knowledge-surface-scan-cost
plan: knowledge-surface
capturedAt: 2026-08-20T17:11:23.948Z
turns: 20
corpusFiles: 136
corpusBytes: 421648
p95DurationMs: 13.955
maxBytesRead: 421648
maxFilesScanned: 136
verdict: pass
---

# Knowledge surface recurring scan-cost evidence

## Inputs and session policy

The fixture is the migrated project knowledge corpus from `tests/fixtures/knowledge-seed-inventory.json` (`720c99029c82bed1bf462dd80c24a580cf4ba0e69ad20ec8046c5bd9372edc3c`). The eligible corpus contains 136 canonical OKF records totaling 421,648 bytes; its path-and-file-digest aggregate is `0b3aac0b773acdbf3fc15d2b59c885a22146d1fd0c7593651346bde524146100`.

The project tree contains 137 OKF markdown files totaling 442,280 bytes. `knowledge/index.md` is the 20,632-byte human map from every legacy source/record ID to its canonical destination, and the disk-authoritative store deliberately excludes that index from eligible record scans.

Each sample is one `before_agent_start` event through the real combined-context handler for an enabled `coding/worker` session. The session searches project plus an empty temporary user knowledge root and has no authored-memory or architecture authorization, so every reported file and byte belongs to the eligible knowledge corpus. The default project configuration was not changed to collect this evidence.

## Gate

`pass` requires p95 duration at or below 250 ms, maximum bytes read at or below 10 MiB, and per-turn files/bytes no greater than the eligible corpus counts above. If any threshold were breached, the verdict would be `amend` and Stage 7/backfill would be blocked while the design reopened; the result would not be treated as degradation and would not authorize a cache, embedding, registry, or alternate backend.

## Raw per-turn stats

| Turn | Files scanned | Bytes read | Duration ms | Knowledge records | Warnings |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 136 | 421648 | 25.162 | 136 | 0 |
| 2 | 136 | 421648 | 9.042 | 136 | 0 |
| 3 | 136 | 421648 | 8.087 | 136 | 0 |
| 4 | 136 | 421648 | 9.647 | 136 | 0 |
| 5 | 136 | 421648 | 9.503 | 136 | 0 |
| 6 | 136 | 421648 | 9.819 | 136 | 0 |
| 7 | 136 | 421648 | 9.658 | 136 | 0 |
| 8 | 136 | 421648 | 9.741 | 136 | 0 |
| 9 | 136 | 421648 | 8.521 | 136 | 0 |
| 10 | 136 | 421648 | 8.609 | 136 | 0 |
| 11 | 136 | 421648 | 7.884 | 136 | 0 |
| 12 | 136 | 421648 | 10.166 | 136 | 0 |
| 13 | 136 | 421648 | 9.382 | 136 | 0 |
| 14 | 136 | 421648 | 9.729 | 136 | 0 |
| 15 | 136 | 421648 | 9.299 | 136 | 0 |
| 16 | 136 | 421648 | 10.11 | 136 | 0 |
| 17 | 136 | 421648 | 9.252 | 136 | 0 |
| 18 | 136 | 421648 | 9.443 | 136 | 0 |
| 19 | 136 | 421648 | 8.529 | 136 | 0 |
| 20 | 136 | 421648 | 13.955 | 136 | 0 |

## Verdict

`pass`: p95 is 13.955 ms, maximum bytes read is 421,648, and maximum files scanned is 136. All are within the ratified thresholds and the eligible corpus bounds, so Stage 6 may proceed without changing the disk-authoritative O(N) design.
