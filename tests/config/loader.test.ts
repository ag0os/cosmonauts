/**
 * Tests for project config loader.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	EPISODE_WARNING_THRESHOLD_DEFAULT,
	loadProjectConfig,
	resolveEpisodicLogConfig,
	resolveKnowledgeSurfaceConfig,
} from "../../lib/config/loader.ts";
import { SIGNAL_KINDS } from "../../lib/lean-run/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("config-test-");

describe("loadProjectConfig", () => {
	test("parses and validates quality review preparation commands", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const path = join(tmp.path, ".cosmonauts", "config.json");
		await writeFile(
			path,
			JSON.stringify({
				qualityReview: {
					prepare: [
						{
							id: "dependencies",
							command: "bun",
							args: ["install", "--frozen-lockfile"],
							timeoutMs: 120000,
						},
					],
				},
			}),
		);
		expect((await loadProjectConfig(tmp.path)).qualityReview?.prepare).toEqual([
			{
				id: "dependencies",
				command: "bun",
				args: ["install", "--frozen-lockfile"],
				timeoutMs: 120000,
			},
		]);
		await writeFile(
			path,
			JSON.stringify({
				qualityReview: {
					prepare: [{ id: "dependencies", argv: ["bun", "install"] }],
				},
			}),
		);
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow(
			"expected id, command, args",
		);
	});

	test("parses configured quality checks and rejects duplicate check IDs", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const path = join(tmp.path, ".cosmonauts", "config.json");
		const check = { id: "test", command: "bun", args: ["run", "test"] };
		await writeFile(
			path,
			JSON.stringify({
				qualityReview: {
					checks: [check],
					reviewerModel: "anthropic/test-model",
				},
			}),
		);
		expect((await loadProjectConfig(tmp.path)).qualityReview).toMatchObject({
			checks: [check],
			reviewerModel: "anthropic/test-model",
		});
		await writeFile(
			path,
			JSON.stringify({ qualityReview: { checks: [check, check] } }),
		);
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow(
			"duplicate step id",
		);
	});

	test("validates quality review assessment and panel deadlines", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const path = join(tmp.path, ".cosmonauts", "config.json");
		await writeFile(
			path,
			JSON.stringify({
				qualityReview: { assessmentTimeoutMs: 900, panelTimeoutMs: 300 },
			}),
		);
		expect((await loadProjectConfig(tmp.path)).qualityReview).toMatchObject({
			assessmentTimeoutMs: 900,
			panelTimeoutMs: 300,
		});
		await writeFile(
			path,
			JSON.stringify({ qualityReview: { panelTimeoutMs: 0 } }),
		);
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow(
			"Invalid qualityReview.panelTimeoutMs",
		);
	});

	test("accepts a reviewer model id that contains slashes", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					reviewerModel: "openrouter/anthropic/claude-sonnet-4.5",
				},
			}),
		);
		expect((await loadProjectConfig(tmp.path)).qualityReview).toEqual({
			reviewerModel: "openrouter/anthropic/claude-sonnet-4.5",
		});
	});

	test("rejects a reviewer model that is not provider/id", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { reviewerModel: "no-provider" } }),
		);
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow(
			"Invalid qualityReview.reviewerModel: expected <provider>/<model-id>",
		);
	});

	test("enables the knowledge surface only for literal true", async () => {
		for (const [value, expected] of [
			[true, true],
			[false, false],
			["true", false],
			[1, false],
			[null, false],
		] as const) {
			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(tmp.path, ".cosmonauts", "config.json"),
				JSON.stringify({ knowledgeSurface: { enabled: value } }),
			);

			const config = await loadProjectConfig(tmp.path);
			expect(resolveKnowledgeSurfaceConfig(config).enabled).toBe(expected);
		}

		expect(resolveKnowledgeSurfaceConfig({}).enabled).toBe(false);
	});

	test("reads the lean repo-map budget", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ lean: { repoMapBudgetTokens: 2400 } }),
		);

		expect((await loadProjectConfig(tmp.path)).lean).toEqual({
			repoMapBudgetTokens: 2400,
		});
	});

	test("skips a lean repo-map budget that is not a positive integer", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			for (const value of [0, -5, 1.5, "1500", null]) {
				await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
				await writeFile(
					join(tmp.path, ".cosmonauts", "config.json"),
					JSON.stringify({ lean: { repoMapBudgetTokens: value } }),
				);

				expect((await loadProjectConfig(tmp.path)).lean, String(value)).toEqual(
					{},
				);
			}
			expect(warn).toHaveBeenCalledTimes(5);
		} finally {
			warn.mockRestore();
		}
	});

	test("reads the lean cap on ignored inputs copied into the builder clone", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ lean: { ignoredInputsCapBytes: 1024 } }),
		);

		expect((await loadProjectConfig(tmp.path)).lean).toEqual({
			ignoredInputsCapBytes: 1024,
		});
	});

	test("skips a lean ignored-inputs cap that is not a positive integer", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(tmp.path, ".cosmonauts", "config.json"),
				JSON.stringify({ lean: { ignoredInputsCapBytes: "50MB" } }),
			);

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({});
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("lean.ignoredInputsCapBytes"),
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("reads the lean run budget", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				lean: { budget: { tokens: 500_000, timeMs: 600_000 } },
			}),
		);

		expect((await loadProjectConfig(tmp.path)).lean).toEqual({
			budget: { tokens: 500_000, timeMs: 600_000 },
		});
	});

	test("keeps the valid lean budget fields and skips the malformed ones", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(tmp.path, ".cosmonauts", "config.json"),
				JSON.stringify({ lean: { budget: { tokens: 0, timeMs: 90_000 } } }),
			);

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({
				budget: { timeMs: 90_000 },
			});
			expect(warn).toHaveBeenCalledWith(
				"[warning] Skipping malformed lean.budget.tokens: expected a positive integer, got 0.",
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("skips a lean time budget longer than a timer can wait", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(tmp.path, ".cosmonauts", "config.json"),
				JSON.stringify({
					lean: { budget: { tokens: 10, timeMs: 2 ** 31 } },
				}),
			);

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({
				budget: { tokens: 10 },
			});
			expect(warn).toHaveBeenCalledWith(
				"[warning] Skipping malformed lean.budget.timeMs: expected a positive integer up to 2147483647, got 2147483648.",
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("skips a lean budget that is not an object", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(tmp.path, ".cosmonauts", "config.json"),
				JSON.stringify({ lean: { repoMapBudgetTokens: 900, budget: 5 } }),
			);

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({
				repoMapBudgetTokens: 900,
			});
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
		}
	});

	async function writeLean(lean: unknown): Promise<void> {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ lean }),
		);
	}

	test("reads the lean required signal kinds, each once", async () => {
		await writeLean({ requiredSignals: ["verify", "dupes", "verify"] });

		expect((await loadProjectConfig(tmp.path)).lean).toEqual({
			requiredSignals: ["verify", "dupes"],
		});
	});

	test("reads an empty lean required signal list as no required kinds", async () => {
		await writeLean({ requiredSignals: [] });

		expect((await loadProjectConfig(tmp.path)).lean).toEqual({
			requiredSignals: [],
		});
	});

	test("leaves the lean required signals unset when the config has none", async () => {
		await writeLean({ repoMapBudgetTokens: 900 });

		expect((await loadProjectConfig(tmp.path)).lean).not.toHaveProperty(
			"requiredSignals",
		);
	});

	test("keeps the known lean required signal kinds and warns about each unknown one", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await writeLean({ requiredSignals: ["mutation", "coverage", 3] });

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({
				requiredSignals: ["mutation"],
				unknownRequiredSignals: ['"coverage"', "3"],
			});
			expect(warn).toHaveBeenCalledWith(
				`[warning] Skipping malformed lean.requiredSignals entry: expected one of ${SIGNAL_KINDS.join(", ")}, got "coverage".`,
			);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			warn.mockRestore();
		}
	});

	test("leaves the default required signals when every listed kind is unknown", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await writeLean({ requiredSignals: ["mutaton"] });

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({
				unknownRequiredSignals: ['"mutaton"'],
			});
		} finally {
			warn.mockRestore();
		}
	});

	test("skips lean required signals that are not an array", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await writeLean({ requiredSignals: "verify" });

			expect((await loadProjectConfig(tmp.path)).lean).toEqual({});
			expect(warn).toHaveBeenCalledWith(
				'[warning] Skipping malformed lean.requiredSignals: expected an array of signal kinds, got "verify".',
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("returns empty config when file does not exist", async () => {
		const config = await loadProjectConfig(tmp.path);
		expect(config).toEqual({});
	});

	test("returns empty config when .cosmonauts dir does not exist", async () => {
		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
		expect(config.chains).toBeUndefined();
	});

	test("throws on read errors other than missing file", async () => {
		await mkdir(join(tmp.path, ".cosmonauts", "config.json"), {
			recursive: true,
		});
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow();
	});

	test("parses domain string", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ domain: "coding" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBe("coding");
	});

	test("defaults domain to undefined when not provided", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBeUndefined();
	});

	test("ignores domain when not a string", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ domain: 42 }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBeUndefined();
	});

	test("parses skills array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", "react"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("parses chains object", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					deploy: {
						description: "Deploy chain",
						chain: "worker",
					},
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.chains).toEqual({
			deploy: { description: "Deploy chain", chain: "worker" },
		});
	});

	test("parses config with both skills and chains", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				skills: ["typescript"],
				chains: {
					plan: { description: "Plan", chain: "planner" },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript"]);
		expect(config.chains).toBeDefined();
	});

	test("throws on invalid JSON", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadProjectConfig(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("throws on non-object JSON (array)", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify([1, 2, 3]),
		);

		await expect(loadProjectConfig(tmp.path)).rejects.toThrow("Invalid config");
	});

	test("returns empty config for empty object", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
		expect(config.chains).toBeUndefined();
	});

	test("filters non-string values from skills array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", 42, null, "react"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("ignores skills when not an array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: "typescript" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
	});

	test("parses skillPaths and resolves them relative to project root", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: [".claude/skills", ".agents/skills"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([
			resolve(tmp.path, ".claude/skills"),
			resolve(tmp.path, ".agents/skills"),
		]);
	});

	test("expands tilde in skillPaths to home directory", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: ["~/.claude/skills"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([join(homedir(), ".claude/skills")]);
	});

	test("filters non-string values from skillPaths", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: ["./skills", 42, null] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([resolve(tmp.path, "./skills")]);
	});

	test("ignores skillPaths when not an array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: "/some/path" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toBeUndefined();
	});

	test("parses activeDomains and domainBindings without changing optional field semantics", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				activeDomains: ["coding", 42, "writing"],
				domainBindings: { "ruby-coding": "ruby-experimental" },
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.activeDomains).toEqual(["coding", "writing"]);
		expect(config.domainBindings).toEqual({
			"ruby-coding": "ruby-experimental",
		});
		expect(config.domain).toBeUndefined();
		expect(config.skills).toBeUndefined();
		expect(config.skillPaths).toBeUndefined();
		expect(config.chains).toBeUndefined();
	});

	test("warns on malformed domainBindings shape instead of dropping it silently", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: ["ruby-coding", "ruby-experimental"],
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domainBindings).toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain(
			"Skipping malformed domainBindings",
		);
		expect(warn.mock.calls[0]?.[0]).toContain('{ "coding": "ruby-coding" }');
		expect(warn.mock.calls[0]?.[0]).toContain(
			'["ruby-coding","ruby-experimental"]',
		);
		warn.mockRestore();
	});

	test("warns on a malformed domainBindings entry instead of dropping it silently", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: {
					"ruby-coding": "ruby-experimental",
					badNumber: 42,
					emptyTarget: "",
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domainBindings).toEqual({
			"ruby-coding": "ruby-experimental",
		});
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0]?.[0]).toContain("badNumber");
		expect(warn.mock.calls[0]?.[0]).toContain("42");
		expect(warn.mock.calls[0]?.[0]).toContain("Skipping malformed");
		expect(warn.mock.calls[1]?.[0]).toContain("emptyTarget");
		expect(warn.mock.calls[1]?.[0]).toContain('""');
		warn.mockRestore();
	});

	test("parses only planned architectureMap primitive config fields", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				architectureMap: {
					sourceRoots: ["lib", "src"],
					moduleRoots: ["lib/agents"],
					exclude: ["fixtures"],
					injectionMaxBytes: 12000,
					narrative: { enabled: false, maxModulesPerRun: 4 },
					unknown: { ignored: true },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.architectureMap).toEqual({
			sourceRoots: ["lib", "src"],
			moduleRoots: ["lib/agents"],
			exclude: ["fixtures"],
			injectionMaxBytes: 12000,
			narrative: { enabled: false, maxModulesPerRun: 4 },
		});
	});

	test("warns and ignores malformed architectureMap entries while preserving unrelated config", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domain: "coding",
				architectureMap: {
					sourceRoots: ["lib", 42],
					moduleRoots: "lib/agents",
					exclude: [null, "fixtures"],
					injectionMaxBytes: "large",
					narrative: { enabled: "yes", maxModulesPerRun: 3 },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domain).toBe("coding");
		expect(config.architectureMap).toEqual({
			sourceRoots: ["lib"],
			exclude: ["fixtures"],
			narrative: { maxModulesPerRun: 3 },
		});
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.sourceRoots entry",
		);
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.moduleRoots",
		);
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.injectionMaxBytes",
		);
		warn.mockRestore();
	});

	test("parses episodicLog as an off-by-default project gate with a positive threshold", async () => {
		await expect(loadProjectConfig(tmp.path)).resolves.toEqual({});
		expect(resolveEpisodicLogConfig({})).toEqual({
			enabled: false,
			warningThreshold: EPISODE_WARNING_THRESHOLD_DEFAULT,
		});

		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		for (const [episodicLog, expected] of [
			[
				{ enabled: true, warningThreshold: 73 },
				{ enabled: true, warningThreshold: 73 },
			],
			[
				{ enabled: false, warningThreshold: 1 },
				{ enabled: false, warningThreshold: 1 },
			],
		] as const) {
			await writeFile(configPath, JSON.stringify({ episodicLog }));
			const loaded = await loadProjectConfig(tmp.path);
			expect(resolveEpisodicLogConfig(loaded)).toEqual(expected);
		}

		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const episodicLog of [
			true,
			[],
			{ enabled: "true" },
			{ enabled: 1 },
			{ warningThreshold: 0 },
			{ warningThreshold: -1 },
			{ warningThreshold: 1.5 },
			{ warningThreshold: "73" },
		]) {
			await writeFile(configPath, JSON.stringify({ episodicLog }));
			const loaded = await loadProjectConfig(tmp.path);
			expect(resolveEpisodicLogConfig(loaded).enabled).toBe(false);
			expect(resolveEpisodicLogConfig(loaded).warningThreshold).toBe(
				EPISODE_WARNING_THRESHOLD_DEFAULT,
			);
		}
		expect(
			warn.mock.calls.every(([message]) =>
				String(message).startsWith("[warning] Skipping malformed episodicLog"),
			),
		).toBe(true);
		warn.mockRestore();
	});

	test("isolates malformed episodicLog settings from every unrelated project config key", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const unrelated = {
			domain: "coding",
			activeDomains: ["coding", "writing"],
			domainBindings: { coding: "ruby-coding" },
			skills: ["typescript", "testing"],
			chains: {
				verify: { description: "Verify", chain: "worker -> reviewer" },
			},
			architectureMap: {
				sourceRoots: ["lib", "domains"],
				moduleRoots: ["lib/memory"],
				exclude: ["fixtures"],
				injectionMaxBytes: 12000,
				narrative: { enabled: true, maxModulesPerRun: 4 },
			},
		} as const;
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ ...unrelated, episodicLog: { enabled: "yes" } }),
		);

		const loaded = await loadProjectConfig(tmp.path);
		const { episodicLog: _episodicLog, ...loadedUnrelated } = loaded;

		expect(JSON.stringify(loadedUnrelated)).toBe(JSON.stringify(unrelated));
		expect(resolveEpisodicLogConfig(loaded)).toEqual({
			enabled: false,
			warningThreshold: EPISODE_WARNING_THRESHOLD_DEFAULT,
		});
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain(
			"[warning] Skipping malformed episodicLog.enabled",
		);
		await expect(
			readFile(join(process.cwd(), "lib", "config", "types.ts"), "utf-8"),
		).resolves.toContain(
			"Projects declare their configuration in `.cosmonauts/config.json`.",
		);
		warn.mockRestore();
	});

	test("isolates malformed analysis provider config from unrelated settings", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		const unrelated = {
			domain: "coding",
			activeDomains: ["coding", "writing"],
			domainBindings: { coding: "ruby-coding" },
			skills: ["typescript", "testing"],
			skillPaths: [".agents/skills"],
			chains: {
				verify: { description: "Verify", chain: "worker -> reviewer" },
			},
			architectureMap: {
				sourceRoots: ["lib", "domains"],
				moduleRoots: ["lib/analysis"],
				exclude: ["fixtures"],
				injectionMaxBytes: 12000,
				narrative: { enabled: true, maxModulesPerRun: 4 },
			},
			episodicLog: { enabled: true, warningThreshold: 73 },
		} as const;
		const expectedUnrelated = {
			...unrelated,
			skillPaths: [resolve(tmp.path, ".agents/skills")],
		};

		for (const malformed of [
			{ analysis: ["fallow"] },
			{ analysis: { provider: 42 } },
			{ analysis: { provider: "  " } },
		]) {
			warn.mockClear();
			await writeFile(
				configPath,
				JSON.stringify({ ...unrelated, ...malformed }),
			);

			const loaded = await loadProjectConfig(tmp.path);
			const { analysis: _analysis, ...loadedUnrelated } = loaded;

			expect(loaded.analysis).toBeUndefined();
			expect(loadedUnrelated).toEqual(expectedUnrelated);
			expect(warn).toHaveBeenCalledOnce();
			const message = String(warn.mock.calls[0]?.[0]);
			expect(message).toContain(
				Array.isArray(malformed.analysis) ? "analysis" : "analysis.provider",
			);
			expect(message).toContain(
				JSON.stringify(
					Array.isArray(malformed.analysis)
						? malformed.analysis
						: malformed.analysis.provider,
				),
			);
		}

		warn.mockClear();
		await writeFile(
			configPath,
			JSON.stringify({ ...unrelated, analysis: { provider: " fallow " } }),
		);
		const loaded = await loadProjectConfig(tmp.path);
		expect(loaded.analysis).toEqual({ provider: "fallow" });
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
