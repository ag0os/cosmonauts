import type { Command } from "commander";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	type mockProcessExitThrow,
	ProcessExitError,
} from "./cli.ts";
import {
	answerPrompt,
	getReadlineMocks,
	resetReadlineMocks,
} from "./readline.ts";

type RegisterCommand = (program: Command) => void;
const readlineMocks = getReadlineMocks();

interface DeleteCommandContext {
	tempDir: string;
	output: ReturnType<typeof captureCommandOutput>;
	exit: ReturnType<typeof mockProcessExitThrow>;
}

export function setupDeleteCommandContext(
	prefix: string,
): () => DeleteCommandContext {
	let context: CommandTestContext;
	const state = {} as DeleteCommandContext;

	beforeEach(async () => {
		context = await createCommandTestContext(prefix);
		state.tempDir = context.tempDir;
		state.output = context.output;
		state.exit = context.exit;
		resetReadlineMocks();
	});

	afterEach(async () => {
		await context.restore();
	});

	return () => state;
}

function commandProgram(registerDeleteCommand: RegisterCommand) {
	return createCommandProgram(registerDeleteCommand);
}

async function expectDeleteToExit(
	registerDeleteCommand: RegisterCommand,
	args: string[],
): Promise<void> {
	await expect(
		commandProgram(registerDeleteCommand).parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

interface CommonDeleteCommandSuite<Entity, Manager> {
	entityName: "plan" | "task";
	registerDeleteCommand: RegisterCommand;
	getContext: () => DeleteCommandContext;
	forceCase: {
		create: (tempDir: string) => Promise<{ manager: Manager; entity: Entity }>;
		id: (entity: Entity) => string;
		get: (manager: Manager, id: string) => Promise<Entity | null>;
		args: (entity: Entity) => string[];
		expectedStdout: string;
	};
	notFound: {
		setup?: (tempDir: string) => Promise<void>;
		id: string;
		jsonError: string;
		humanError: string;
	};
	cancellation: {
		create: (tempDir: string) => Promise<{ manager: Manager; entity: Entity }>;
		id: (entity: Entity) => string;
		get: (manager: Manager, id: string) => Promise<Entity | null>;
		spyOnDelete: () => unknown;
		jsonStdout: string;
	};
	managerError: {
		create: (tempDir: string) => Promise<void>;
		mockFailure: () => void;
		id: string;
		jsonStdout: string;
		humanStderr: string;
	};
}

export function runCommonDeleteCommandTests<Entity, Manager>(
	config: CommonDeleteCommandSuite<Entity, Manager>,
): void {
	it(`force deletes a ${config.entityName} in human mode without prompting`, async () => {
		const { tempDir, output, exit } = config.getContext();
		const { manager, entity } = await config.forceCase.create(tempDir);
		const id = config.forceCase.id(entity);

		await commandProgram(config.registerDeleteCommand).parseAsync([
			"node",
			"test",
			...config.forceCase.args(entity),
		]);

		await expect(config.forceCase.get(manager, id)).resolves.toBeNull();
		expect(readlineMocks.question).not.toHaveBeenCalled();
		expect(output.stdout()).toBe(config.forceCase.expectedStdout);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not found errors in JSON mode", async () => {
		const { tempDir, output, exit } = config.getContext();
		await config.notFound.setup?.(tempDir);

		await expectDeleteToExit(config.registerDeleteCommand, [
			"--json",
			"delete",
			config.notFound.id,
			"--force",
		]);

		expect(output.stdout()).toContain(config.notFound.jsonError);
		expect(output.stderr()).toBe("");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints not found errors in human mode", async () => {
		const { tempDir, output, exit } = config.getContext();
		await config.notFound.setup?.(tempDir);

		await expectDeleteToExit(config.registerDeleteCommand, [
			"delete",
			config.notFound.id,
			"--force",
		]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toContain(config.notFound.humanError);
		expect(exit.calls()[0]).toBe(1);
	});

	it.each([
		["JSON", "n", ["--json"], config.cancellation.jsonStdout],
		["plain", "no", ["--plain"], "cancelled\n"],
		["human", "", [], "Deletion cancelled.\n"],
	] as const)("prints cancellation in %s mode without deleting", async (_mode, answer, modeArgs, expectedStdout) => {
		const { tempDir, output, exit } = config.getContext();
		const { manager, entity } = await config.cancellation.create(tempDir);
		const id = config.cancellation.id(entity);
		answerPrompt(answer);
		const deleteSpy = config.cancellation.spyOnDelete();

		await commandProgram(config.registerDeleteCommand).parseAsync([
			"node",
			"test",
			...modeArgs,
			"delete",
			id,
		]);

		await expect(config.cancellation.get(manager, id)).resolves.not.toBeNull();
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(output.stdout()).toBe(expectedStdout);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints manager errors in JSON mode", async () => {
		const { tempDir, output, exit } = config.getContext();
		await config.managerError.create(tempDir);
		config.managerError.mockFailure();

		await expectDeleteToExit(config.registerDeleteCommand, [
			"--json",
			"delete",
			config.managerError.id,
			"--force",
		]);

		expect(output.stdout()).toBe(config.managerError.jsonStdout);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("prints manager errors in human mode", async () => {
		const { tempDir, output, exit } = config.getContext();
		await config.managerError.create(tempDir);
		config.managerError.mockFailure();

		await expectDeleteToExit(config.registerDeleteCommand, [
			"delete",
			config.managerError.id,
			"--force",
		]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe(config.managerError.humanStderr);
		expect(exit.calls()).toEqual([1]);
	});
}
