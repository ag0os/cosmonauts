import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import * as ts from "typescript";
import { loadCompilerOptions } from "./analyzer.ts";
import { collectFileExports } from "./file-graph-exports.ts";
import { collectFileSnapshots } from "./freshness.ts";
import {
	type ArchitectureMapConfig,
	type ArchitectureMapScanObserver,
	FILE_GRAPH_SCHEMA_VERSION,
	type FileGraph,
	type FileGraphEdge,
	type FileGraphNode,
	type FileGraphNodeKind,
	type ProjectSnapshot,
	type SourceFileSnapshot,
} from "./types.ts";

/** Test roots scanned by the file-graph pass only; the module analyzer never sees them. */
export const DEFAULT_FILE_GRAPH_TEST_ROOTS = ["tests"] as const;

const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/u;

export interface BuildFileGraphOptions {
	readonly projectRoot: string;
	readonly config: ArchitectureMapConfig;
	readonly snapshot: ProjectSnapshot;
	readonly testRoots?: readonly string[];
	readonly observer?: ArchitectureMapScanObserver;
}

interface ImportRecord {
	readonly specifier: ts.StringLiteralLike;
	readonly weight: number;
	readonly typeOnly: boolean;
}

interface FileAnalysisContext {
	readonly program: ts.Program;
	readonly checker: ts.TypeChecker;
	readonly compilerOptions: ts.CompilerOptions;
	readonly host: ts.CompilerHost;
	readonly cache: ts.ModuleResolutionCache;
	readonly lookup: ReadonlyMap<string, string>;
}

export async function buildFileGraph(
	options: BuildFileGraphOptions,
): Promise<FileGraph> {
	const testFiles = await collectFileGraphTestFiles(options);
	const nodeKinds = classifyNodes(options.snapshot.files, testFiles);
	const { nodes, edges } = analyzeFiles(options.projectRoot, nodeKinds);
	return {
		schemaVersion: FILE_GRAPH_SCHEMA_VERSION,
		projectHash: options.snapshot.hash,
		graphHash: computeFileGraphHash(options.snapshot.hash, testFiles),
		nodes,
		edges,
	};
}

export function collectFileGraphTestFiles(options: {
	readonly projectRoot: string;
	readonly config: ArchitectureMapConfig;
	readonly testRoots?: readonly string[];
	readonly observer?: ArchitectureMapScanObserver;
}): Promise<readonly SourceFileSnapshot[]> {
	return collectFileSnapshots({
		projectRoot: options.projectRoot,
		roots: options.testRoots ?? DEFAULT_FILE_GRAPH_TEST_ROOTS,
		exclude: options.config.exclude,
		observer: options.observer,
	});
}

/** Extends the project hash with the test-root files only the graph reads. */
export function computeFileGraphHash(
	projectHash: string,
	testFiles: readonly SourceFileSnapshot[],
): string {
	const hash = createHash("sha256");
	hash.update(`fileGraph\0${FILE_GRAPH_SCHEMA_VERSION}\0${projectHash}\0`);
	for (const file of testFiles) {
		hash.update(`test\0${file.path}\0${file.hash}\0`);
	}
	return hash.digest("hex");
}

function classifyNodes(
	sourceFiles: readonly SourceFileSnapshot[],
	testFiles: readonly SourceFileSnapshot[],
): ReadonlyMap<string, FileGraphNodeKind> {
	const kinds = new Map<string, FileGraphNodeKind>();
	for (const file of sourceFiles) {
		kinds.set(
			file.path,
			TEST_FILE_PATTERN.test(basename(file.path)) ? "test" : "source",
		);
	}
	for (const file of testFiles) kinds.set(file.path, "test");
	return new Map([...kinds.entries()].sort(([a], [b]) => compareStrings(a, b)));
}

function analyzeFiles(
	projectRoot: string,
	nodeKinds: ReadonlyMap<string, FileGraphNodeKind>,
): { readonly nodes: FileGraphNode[]; readonly edges: FileGraphEdge[] } {
	const context = createAnalysisContext(projectRoot, [...nodeKinds.keys()]);
	const nodes: FileGraphNode[] = [];
	const edges = new Map<string, FileGraphEdge>();
	for (const [path, kind] of nodeKinds) {
		const sourceFile = context.program.getSourceFile(
			resolve(projectRoot, path),
		);
		if (!sourceFile) {
			nodes.push({ path, kind, exports: [] });
			continue;
		}
		nodes.push({
			path,
			kind,
			exports: collectFileExports(context.checker, sourceFile),
		});
		for (const record of collectImportRecords(sourceFile)) {
			const target = resolveTarget(context, sourceFile, record.specifier);
			if (target && target !== path) addEdge(edges, path, target, record);
		}
	}
	return { nodes, edges: [...edges.values()].sort(compareEdges) };
}

function createAnalysisContext(
	projectRoot: string,
	paths: readonly string[],
): FileAnalysisContext {
	const compilerOptions = loadCompilerOptions(projectRoot);
	const host = ts.createCompilerHost(compilerOptions, true);
	const program = ts.createProgram({
		rootNames: paths.map((path) => resolve(projectRoot, path)),
		options: compilerOptions,
		host,
	});
	return {
		program,
		checker: program.getTypeChecker(),
		compilerOptions,
		host,
		cache: ts.createModuleResolutionCache(
			projectRoot,
			(fileName) => host.getCanonicalFileName(fileName),
			compilerOptions,
		),
		lookup: new Map(
			paths.map((path) => [
				normalizeAbsolutePath(resolve(projectRoot, path)),
				path,
			]),
		),
	};
}

function resolveTarget(
	context: FileAnalysisContext,
	sourceFile: ts.SourceFile,
	specifier: ts.StringLiteralLike,
): string | undefined {
	const resolved = ts.resolveModuleName(
		specifier.text,
		sourceFile.fileName,
		context.compilerOptions,
		context.host,
		context.cache,
		undefined,
		context.program.getModeForUsageLocation(sourceFile, specifier),
	).resolvedModule;
	if (!resolved) return undefined;
	return context.lookup.get(normalizeAbsolutePath(resolved.resolvedFileName));
}

function addEdge(
	edges: Map<string, FileGraphEdge>,
	from: string,
	to: string,
	record: ImportRecord,
): void {
	const key = `${from}\0${to}`;
	const existing = edges.get(key);
	edges.set(key, {
		from,
		to,
		weight: (existing?.weight ?? 0) + record.weight,
		typeOnly: (existing?.typeOnly ?? true) && record.typeOnly,
	});
}

function collectImportRecords(
	sourceFile: ts.SourceFile,
): readonly ImportRecord[] {
	const records: ImportRecord[] = [];
	for (const statement of sourceFile.statements) {
		const record = statementImportRecord(statement);
		if (record) records.push(record);
	}
	if (sourceFile.text.includes("import(")) {
		collectInlineImports(sourceFile, records);
	}
	return records;
}

function statementImportRecord(
	statement: ts.Statement,
): ImportRecord | undefined {
	if (
		ts.isImportDeclaration(statement) &&
		ts.isStringLiteral(statement.moduleSpecifier)
	) {
		return {
			specifier: statement.moduleSpecifier,
			...importClauseWeight(statement.importClause),
		};
	}
	if (
		ts.isExportDeclaration(statement) &&
		statement.moduleSpecifier &&
		ts.isStringLiteral(statement.moduleSpecifier)
	) {
		return {
			specifier: statement.moduleSpecifier,
			...exportClauseWeight(statement),
		};
	}
	return undefined;
}

interface ClauseWeight {
	readonly weight: number;
	readonly typeOnly: boolean;
}

function importClauseWeight(clause: ts.ImportClause | undefined): ClauseWeight {
	if (!clause) return { weight: 1, typeOnly: false };
	const bindings = clause.namedBindings;
	if (bindings && ts.isNamespaceImport(bindings)) {
		return { weight: clause.name ? 2 : 1, typeOnly: clause.isTypeOnly };
	}
	return namedImportWeight(clause, bindings?.elements ?? []);
}

function namedImportWeight(
	clause: ts.ImportClause,
	named: readonly ts.ImportSpecifier[],
): ClauseWeight {
	const hasDefault = clause.name !== undefined;
	return {
		weight: Math.max(named.length + Number(hasDefault), 1),
		typeOnly: clause.isTypeOnly || (!hasDefault && allTypeOnly(named)),
	};
}

function exportClauseWeight(declaration: ts.ExportDeclaration): ClauseWeight {
	const clause = declaration.exportClause;
	if (!clause || !ts.isNamedExports(clause)) {
		return { weight: 1, typeOnly: declaration.isTypeOnly };
	}
	return {
		weight: Math.max(clause.elements.length, 1),
		typeOnly: declaration.isTypeOnly || allTypeOnly(clause.elements),
	};
}

function allTypeOnly(
	elements: readonly { readonly isTypeOnly: boolean }[],
): boolean {
	return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

/** A string-literal dynamic import counts as one runtime name; an import type as one type-only name. */
function collectInlineImports(node: ts.Node, records: ImportRecord[]): void {
	ts.forEachChild(node, (child) => {
		const record = inlineImportRecord(child);
		if (record) records.push(record);
		collectInlineImports(child, records);
	});
}

function inlineImportRecord(node: ts.Node): ImportRecord | undefined {
	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword
	) {
		const argument = node.arguments[0];
		if (argument && ts.isStringLiteralLike(argument)) {
			return { specifier: argument, weight: 1, typeOnly: false };
		}
	}
	if (
		ts.isImportTypeNode(node) &&
		ts.isLiteralTypeNode(node.argument) &&
		ts.isStringLiteral(node.argument.literal)
	) {
		return { specifier: node.argument.literal, weight: 1, typeOnly: true };
	}
	return undefined;
}

function compareEdges(left: FileGraphEdge, right: FileGraphEdge): number {
	return (
		compareStrings(left.from, right.from) || compareStrings(left.to, right.to)
	);
}

function compareStrings(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function normalizeAbsolutePath(path: string): string {
	return resolve(path)
		.split(/[\\/]+/u)
		.join("/");
}
