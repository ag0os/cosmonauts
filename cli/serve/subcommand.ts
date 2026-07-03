import { spawn } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Command, InvalidArgumentError } from "commander";
import { createArtifactViewerServer } from "../../lib/artifact-viewer/index.ts";
import { printLines } from "../shared/output.ts";

export interface ServeCommandOptions {
	readonly projectRoot?: string;
	readonly host?: string;
	readonly port?: number;
	readonly open?: boolean;
}

export interface ServeStartupResult {
	readonly server: Server;
	readonly url: string;
	readonly openWarning?: string;
}

type BrowserOpener = (url: string) => Promise<void>;

interface ServeCommandDependencies {
	readonly createServer?: typeof createArtifactViewerServer;
	readonly openBrowser?: BrowserOpener;
	readonly writeOutput?: (line: string) => void;
	readonly writeWarning?: (line: string) => void;
}

interface ServeProgramOptions extends ServeCommandDependencies {
	readonly projectRoot?: string;
	readonly onStarted?: (result: ServeStartupResult) => void;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;

export function createServeProgram(options: ServeProgramOptions = {}): Command {
	const program = new Command();

	program
		.name("cosmonauts serve")
		.description("Serve local read-only Cosmonauts artifact views")
		.option("--host <host>", "Host to bind", DEFAULT_HOST)
		.option("--port <port>", "Port to bind", parsePort, DEFAULT_PORT)
		.option("--open", "Open the served URL in the platform browser")
		.option("--no-open", "Do not open the platform browser")
		.action(
			async (commandOptions: {
				readonly host: string;
				readonly port: number;
				readonly open?: boolean;
			}) => {
				const result = await runServeCommand(
					{
						projectRoot: options.projectRoot ?? process.cwd(),
						host: commandOptions.host,
						port: commandOptions.port,
						open: commandOptions.open === true,
					},
					options,
				);
				options.onStarted?.(result);
			},
		);

	return program;
}

export async function runServeCommand(
	options: ServeCommandOptions = {},
	dependencies: ServeCommandDependencies = {},
): Promise<ServeStartupResult> {
	const projectRoot = options.projectRoot ?? process.cwd();
	const host = options.host ?? DEFAULT_HOST;
	const port = options.port ?? DEFAULT_PORT;
	const createServer = dependencies.createServer ?? createArtifactViewerServer;
	const writeOutput =
		dependencies.writeOutput ?? ((line: string) => printLines([line]));
	const writeWarning =
		dependencies.writeWarning ??
		((line: string) => printLines([line], "stderr"));

	const server = createServer({ projectRoot });
	const address = await listen(server, { host, port });
	const url = formatServerUrl(host, address.port);
	writeOutput(`Serving Cosmonauts artifacts at ${url}`);

	let openWarning: string | undefined;
	if (options.open) {
		try {
			await (dependencies.openBrowser ?? openBrowser)(url);
		} catch (error) {
			openWarning = `Warning: failed to open browser: ${errorMessage(error)}`;
			writeWarning(openWarning);
		}
	}

	return { server, url, openWarning };
}

function listen(
	server: Server,
	options: { readonly host: string; readonly port: number },
): Promise<AddressInfo> {
	return new Promise((resolve, reject) => {
		const onError = (error: Error) => {
			server.off("listening", onListening);
			reject(error);
		};
		const onListening = () => {
			server.off("error", onError);
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("HTTP server did not report a TCP address"));
				return;
			}
			resolve(address);
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(options.port, options.host);
	});
}

function parsePort(value: string): number {
	const port = Number(value);
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new InvalidArgumentError("port must be an integer from 0 to 65535");
	}
	return port;
}

function formatServerUrl(host: string, port: number): string {
	const urlHost =
		host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
	return `http://${urlHost}:${port}/`;
}

async function openBrowser(url: string): Promise<void> {
	const command = platformOpenCommand(url);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command.command, command.args, {
			stdio: "ignore",
			windowsHide: true,
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(`${command.command} exited with code ${code ?? "null"}`),
			);
		});
	});
}

function platformOpenCommand(url: string): { command: string; args: string[] } {
	if (process.platform === "darwin") {
		return { command: "open", args: [url] };
	}
	if (process.platform === "win32") {
		return { command: "cmd", args: ["/c", "start", "", url] };
	}
	return { command: "xdg-open", args: [url] };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
