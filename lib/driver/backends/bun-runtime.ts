interface BunSubprocess {
	readonly exited: Promise<number>;
	readonly stdout: ConstructorParameters<typeof Response>[0];
	readonly stderr: ConstructorParameters<typeof Response>[0];
	/**
	 * Always present on a real Bun subprocess. Optional here because the backend
	 * suites stub `Bun` wholesale, so callers must guard before using it as a
	 * process-group address.
	 */
	readonly pid?: number;
}

interface BunSpawnOptions {
	cwd: string;
	stdin: unknown;
	stdout: "pipe";
	stderr: "pipe";
	signal?: AbortSignal;
	/** Makes the child lead its own process group so its tree can be reaped. */
	detached?: boolean;
}

export interface BunRuntime {
	file(path: string): unknown;
	spawn(argv: string[], options: BunSpawnOptions): BunSubprocess;
}
