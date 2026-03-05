/**
 * Regression tests for createPiSpawner() spawn behavior.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	getModel: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
	getModel: mocks.getModel,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: mocks.createAgentSession,
	createCodingTools: () => [],
	createReadOnlyTools: () => [],
	DefaultResourceLoader: class {
		async reload() {}
	},
	SessionManager: {
		inMemory: () => ({ kind: "in-memory" }),
	},
}));

import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";

describe("createPiSpawner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getModel.mockReturnValue({ id: "mock-model" });
		mocks.createAgentSession.mockResolvedValue({
			session: {
				sessionId: "session-1",
				messages: [],
				prompt: vi.fn(async () => undefined),
				dispose: vi.fn(),
			},
		});
	});

	test("uses definition thinkingLevel when spawn thinkingLevel is omitted", async () => {
		const spawner = createPiSpawner();

		await spawner.spawn({
			role: "planner",
			cwd: "/tmp/test-project",
			prompt: "Plan the work.",
		});

		expect(mocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				thinkingLevel: "high",
			}),
		);
	});
});
