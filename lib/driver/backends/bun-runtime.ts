interface BunSubprocess {
	readonly exited: Promise<number>;
	readonly stdout: ConstructorParameters<typeof Response>[0];
	readonly stderr: ConstructorParameters<typeof Response>[0];
}

interface BunSpawnOptions {
	cwd: string;
	stdin: unknown;
	stdout: "pipe";
	stderr: "pipe";
	signal?: AbortSignal;
}

export interface BunRuntime {
	file(path: string): unknown;
	spawn(argv: string[], options: BunSpawnOptions): BunSubprocess;
}
