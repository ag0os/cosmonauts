---
kind: knowledge-surface-scan-cost
plan: knowledge-surface
capturedAt: 2026-08-20T21:47:28.669Z
turns: 20
agentId: coding/worker
composition: buildSessionParams
knowledgeCorpusFiles: 136
knowledgeCorpusBytes: 421677
architectureSourceFiles: 267
architectureConfigFiles: 2
architectureIoFiles: 277
architectureIoBytes: 1339
corpusFiles: 413
corpusBytes: 423016
p95DurationMs: 18.916
maxBytesRead: 423016
maxFilesScanned: 413
durationThresholdMs: 250
bytesThreshold: 10485760
verdict: pass
---

# Knowledge surface recurring scan-cost evidence

## Inputs and production session policy

The knowledge input is the migrated project knowledge corpus from `tests/fixtures/knowledge-seed-inventory.json`. Its 136 eligible canonical OKF records total 421,677 bytes; the sorted path-and-file-digest aggregate is `e026352de70b218b7e0a4c95b6eebf4c686c62456ca8d4c8df53e602d70a6408`. `knowledge/index.md` remains a human migration map and is excluded from the eligible record scan.

The architecture input is an isolated copy of the shipped TypeScript source roots (`lib`, `cli`, `domains`, and `bundled`), `package.json`, and `tsconfig.json`, with a current representative architecture index generated from their stat fingerprint. It contains 267 eligible TS/TSX source files and 2 analyzer configuration files. Each architecture retrieval performs 277 file operations: 1 architecture config read, 1 freshness-index read, 267 source stats, 7 analyzer-config stat/read operations, and 1 map-index content read. Those reads total 1,339 bytes: the 166-byte project config, the 376-byte index read twice, and the 421-byte TypeScript config. Stat-only work adds no synthetic bytes.

Every sample is one `before_agent_start` event from the named inline factory returned by production `buildSessionParams` for the shipped worker definition. The enabled `coding/worker` session has the architecture authorization selected by session assembly because that definition requests `architecture-memory`. Consequently every row covers both the 136-file knowledge scan and all recurring architecture config, freshness/source-tree, analyzer-config, and index I/O in the real combined-context handler. The worker is not authorized for authored memory in production, so no authored-memory section is invented for this composition.

The combined eligible bound is therefore 413 recurring file operations and 423,016 bytes read per turn. Rendered context framing and the synthetic freshness banner are provider-visible output, not disk input, and are not counted as bytes read.

## Gate

`pass` requires p95 duration at or below the 250 ms duration threshold, maximum bytes read at or below the 10 MiB byte threshold, and per-turn file/byte totals no greater than the 413-operation/423,016-byte eligible combined corpus above. If any threshold were breached, the verdict would be `amend` and Stage 7/backfill would be blocked while the design reopened. A breach is not a degraded pass and does not by itself authorize a cache, embedding, registry, or alternate backend.

## Raw per-turn stats

| Turn | Knowledge files | Knowledge bytes | Knowledge records | Architecture files | Architecture bytes | Architecture records | Total files | Total bytes | Duration ms | Warnings |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 38.824 | 0 |
| 2 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.245 | 0 |
| 3 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.459 | 0 |
| 4 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.631 | 0 |
| 5 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.363 | 0 |
| 6 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 16.179 | 0 |
| 7 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 16.566 | 0 |
| 8 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 15.046 | 0 |
| 9 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 18.916 | 0 |
| 10 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 15.32 | 0 |
| 11 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 15.154 | 0 |
| 12 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 13.496 | 0 |
| 13 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.974 | 0 |
| 14 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.036 | 0 |
| 15 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.904 | 0 |
| 16 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 12.559 | 0 |
| 17 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 15.743 | 0 |
| 18 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.578 | 0 |
| 19 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 14.074 | 0 |
| 20 | 136 | 421677 | 136 | 277 | 1339 | 1 | 413 | 423016 | 13.206 | 0 |

## Verdict

`pass`: p95 is 18.916 ms, maximum bytes read is 423,016, and maximum files scanned is 413. All values are within the ratified thresholds and the complete eligible combined I/O bounds, so the disk-authoritative O(N) design remains accepted without caching, embeddings, or other excluded behavior.
