import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface AnalysisTool {
	name: string;
	configFile: string;
	description: string;
	auditCommand: string;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function fallowTool(configFile: string): AnalysisTool {
	return {
		name: "fallow",
		configFile,
		description:
			"TypeScript/JavaScript dead code, duplication, and complexity audit",
		auditCommand: "npx fallow audit",
	};
}

async function detectFallow(cwd: string): Promise<AnalysisTool | null> {
	const configFiles = ["fallow.toml", ".fallowrc.json", ".fallowrc.toml"];
	for (const file of configFiles) {
		if (await fileExists(join(cwd, file))) {
			return fallowTool(file);
		}
	}

	const pkgPath = join(cwd, "package.json");
	if (await fileExists(pkgPath)) {
		try {
			const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			if (
				pkg.devDependencies?.fallow !== undefined ||
				pkg.dependencies?.fallow !== undefined
			) {
				return fallowTool("package.json");
			}
		} catch {
			// unparseable package.json — skip
		}
	}

	return null;
}

async function detectTools(cwd: string): Promise<AnalysisTool[]> {
	const results = await Promise.all([
		detectFallow(cwd),
		// Future: detectReek(cwd), detectCargoUdeps(cwd), etc.
	]);
	return results.filter((t): t is AnalysisTool => t !== null);
}

function buildToolsBlock(tools: AnalysisTool[]): string {
	const lines = tools.map(
		(t) =>
			`- **${t.name}** (\`${t.configFile}\`) — ${t.description}. Audit command: \`${t.auditCommand}\``,
	);
	return `## Detected Analysis Tools\n\n${lines.join("\n")}`;
}

export default function projectToolsExtension(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const tools = await detectTools(ctx.cwd);
		if (tools.length === 0) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildToolsBlock(tools)}`,
		};
	});
}
