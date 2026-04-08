import { spawn } from "node:child_process";

function translateArgs(args) {
	const translated = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--grep") {
			const pattern = args[i + 1];
			if (pattern !== undefined) {
				translated.push("--testNamePattern", pattern);
				i++;
				continue;
			}
		}
		translated.push(arg);
	}
	return translated;
}

const args = translateArgs(process.argv.slice(2));
const vitestBinary = process.platform === "win32" ? "vitest.cmd" : "vitest";
const child = spawn(vitestBinary, ["run", ...args], {
	stdio: "inherit",
	env: process.env,
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});
