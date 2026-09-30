import { readFileSync } from "node:fs";

const r = JSON.parse(
	readFileSync(process.argv[2] ?? ".spike/reports/mutation.json", "utf8"),
);
const counts = {};
for (const [f, d] of Object.entries(r.files))
	for (const m of d.mutants) {
		counts[m.status] = (counts[m.status] ?? 0) + 1;
		if (m.status === "Survived" || m.status === "NoCoverage") {
			const src = d.source
				.split("\n")
				[m.location.start.line - 1].trim()
				.slice(0, 90);
			console.log(
				`${m.status.padEnd(10)} ${f}:${m.location.start.line} ${m.mutatorName} -> ${JSON.stringify(m.replacement ?? "").slice(0, 60)} | ${src}`,
			);
		}
	}
console.log(counts);
