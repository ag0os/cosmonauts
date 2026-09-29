import { describe, expect, test, vi } from "vitest";

const piMocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	inMemory: vi.fn(() => ({ kind: "in-memory-session-manager" })),
	reload: vi.fn(async () => undefined),
	resourceOptions: [] as unknown[],
}));

vi.mock("@earendil-works/pi-co" + "ding-agent", () => ({
	ModelRegistry: class {
		find = vi.fn((provider: string, id: string) => ({ provider, id }));
	},
	ModelRuntime: {
		create: vi.fn(async () => ({ kind: "model-runtime" })),
	},
	DefaultResourceLoader: class {
		constructor(options: unknown) {
			piMocks.resourceOptions.push(options);
		}

		reload = piMocks.reload;
	},
	getAgentDir: vi.fn(() => "/fixture-agent"),
	SessionManager: { inMemory: piMocks.inMemory },
	createAgentSession: piMocks.createAgentSession,
}));

import { createPiArchitectureNarrativeProvider } from "../../../cli/architecture/narrative-provider.ts";
import type { NarrativeInput } from "../../../lib/architecture-map/index.ts";

interface FakeSession {
	readonly messages: unknown[];
	readonly prompts: string[];
	prompt(text: string): Promise<void>;
}

function fakeSession(reply: string): FakeSession {
	const messages: unknown[] = [];
	const prompts: string[] = [];
	return {
		messages,
		prompts,
		async prompt(text: string) {
			prompts.push(text);
			messages.push({
				role: "assistant",
				content: [{ type: "text", text: reply }],
			});
		},
	};
}

const input: NarrativeInput = {
	skeleton: {
		resource: "lib/alpha",
		rootDir: "/fixture/project/lib/alpha",
		files: ["lib/alpha/index.ts"],
		hasBarrel: true,
		publicInterface: [],
		dependencies: [],
		externalDependencies: [],
		sourceHash: "source-hash",
		skeletonHash: "skeleton-hash",
	},
};

describe("Pi architecture narrative provider", () => {
	test("builds a tool-less session at the project root with the architecture prompt and parses strict JSON", async () => {
		const session = fakeSession(
			JSON.stringify({
				oneLiner: "Alpha does one thing.",
				text: "Alpha paragraph.",
			}),
		);
		piMocks.createAgentSession.mockResolvedValueOnce({ session });

		const provider = createPiArchitectureNarrativeProvider({
			projectRoot: "/fixture/project",
			model: "test/model",
		});
		await expect(provider.generate(input)).resolves.toEqual({
			oneLiner: "Alpha does one thing.",
			text: "Alpha paragraph.",
		});

		expect(piMocks.resourceOptions.at(-1)).toMatchObject({
			cwd: "/fixture/project",
			agentDir: "/fixture-agent",
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: expect.any(String),
		});
		const resourceOptions = piMocks.resourceOptions.at(-1) as {
			systemPrompt: string;
		};
		expect(resourceOptions.systemPrompt).toContain(
			"architecture-map narratives",
		);
		expect(resourceOptions.systemPrompt).toContain(
			"strict JSON with keys oneLiner and text",
		);
		expect(resourceOptions.systemPrompt).toContain("Do not invent behavior");
		expect(piMocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/fixture/project",
				agentDir: "/fixture-agent",
				model: { provider: "test", id: "model" },
				noTools: "all",
				sessionManager: { kind: "in-memory-session-manager" },
			}),
		);
		expect(session.prompts).toHaveLength(1);
		expect(JSON.parse(session.prompts[0] ?? "")).toEqual({
			task: "Generate an architecture-map narrative for this module skeleton.",
			module: input.skeleton,
			output: { oneLiner: "single sentence", text: "short paragraph" },
		});
	});

	test("reuses one session across generations and falls back to first-line prose for non-JSON replies", async () => {
		const session = fakeSession("Beta summary line\nmore detail");
		piMocks.createAgentSession.mockResolvedValueOnce({ session });
		const sessionsBefore = piMocks.createAgentSession.mock.calls.length;

		const provider = createPiArchitectureNarrativeProvider({
			projectRoot: "/fixture/project",
		});
		await expect(provider.generate(input)).resolves.toEqual({
			oneLiner: "Beta summary line",
			text: "Beta summary line\nmore detail",
		});
		const priorNarrative = {
			status: "generated" as const,
			oneLiner: "Old line.",
			text: "Old text.",
		};
		await provider.generate({ ...input, priorNarrative });
		expect(JSON.parse(session.prompts[1] ?? "")).toMatchObject({
			module: input.skeleton,
			priorNarrative,
		});

		expect(piMocks.createAgentSession.mock.calls.length - sessionsBefore).toBe(
			1,
		);
		expect(session.prompts).toHaveLength(2);
	});

	test("fails when the session yields no assistant text", async () => {
		const session = fakeSession("");
		session.prompt = async () => undefined;
		piMocks.createAgentSession.mockResolvedValueOnce({ session });

		await expect(
			createPiArchitectureNarrativeProvider({
				projectRoot: "/fixture/project",
			}).generate(input),
		).rejects.toThrow(/no assistant text/u);
	});
});
