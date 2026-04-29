import * as readline from "node:readline";

export async function promptConfirm(message: string): Promise<boolean> {
	const prompt = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		prompt.question(formatConfirmQuestion(message), (answer) => {
			prompt.close();
			resolve(isConfirmedAnswer(answer));
		});
	});
}

function formatConfirmQuestion(message: string): string {
	return `${message} (y/N): `;
}

function isConfirmedAnswer(answer: string): boolean {
	const normalized = answer.trim().toLowerCase();
	return normalized === "y" || normalized === "yes";
}
