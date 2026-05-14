export function parseBackendArgsEnv(
	raw: string | undefined,
	envName: string,
): string[] | undefined {
	const value = raw?.trim();
	if (!value) {
		return undefined;
	}

	if (value.startsWith("[")) {
		return parseJsonArgs(value, envName);
	}

	return splitShellWords(value, envName);
}

export function isEnabledEnv(value: string | undefined): boolean {
	return value === "1" || value?.toLowerCase() === "true";
}

function parseJsonArgs(value: string, envName: string): string[] {
	const parsed = JSON.parse(value) as unknown;
	if (
		!Array.isArray(parsed) ||
		!parsed.every((item) => typeof item === "string")
	) {
		throw new Error(`${envName} must be a JSON string array`);
	}
	return parsed;
}

function splitShellWords(value: string, envName: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;

	for (const char of value) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			pushArg(args, current);
			current = "";
			continue;
		}
		current += char;
	}

	if (escaped) {
		current += "\\";
	}
	if (quote) {
		throw new Error(`${envName} has an unterminated quote`);
	}
	pushArg(args, current);
	return args;
}

function pushArg(args: string[], arg: string): void {
	if (arg.length > 0) {
		args.push(arg);
	}
}
