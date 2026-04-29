import { vi } from "vitest";

type QuestionCallback = (answer: string) => void;

const readlineMocks = vi.hoisted(() => ({
	close: vi.fn<() => void>(),
	question: vi.fn<(query: string, callback: QuestionCallback) => void>(),
}));

export function getReadlineMocks() {
	return readlineMocks;
}

vi.mock("node:readline", () => ({
	createInterface: () => ({
		close: readlineMocks.close,
		question: readlineMocks.question,
	}),
}));

export function resetReadlineMocks(): void {
	readlineMocks.close.mockReset();
	readlineMocks.question.mockReset();
}

export function answerPrompt(answer: string): void {
	readlineMocks.question.mockImplementation((_query, callback) => {
		callback(answer);
	});
}
