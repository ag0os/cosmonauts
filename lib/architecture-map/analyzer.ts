import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
	basename,
	dirname,
	extname,
	isAbsolute,
	relative,
	resolve,
} from "node:path";
import * as ts from "typescript";
import type {
	AnalysisInput,
	AnalysisResult,
	ArchitectureMapConfig,
	ModuleDependency,
	ModuleSkeleton,
	PublicExport,
	SourceAnalyzer,
	SourceFileSnapshot,
} from "./types.ts";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const BARREL_FILENAMES = new Set(["index.ts", "index.tsx"]);

export function createTypeScriptSourceAnalyzer(): SourceAnalyzer {
	return {
		getConfigInputs: getTypeScriptConfigInputs,
		analyze: analyzeTypeScriptSources,
	};
}

export const typescriptSourceAnalyzer = createTypeScriptSourceAnalyzer();

async function getTypeScriptConfigInputs(
	projectRoot: string,
	_config: ArchitectureMapConfig,
): Promise<readonly string[]> {
	const inputs = new Set<string>();
	await addIfFile(projectRoot, "package.json", inputs);
	await collectTsconfigInputs(projectRoot, "tsconfig.json", inputs, new Set());
	return [...inputs].sort();
}

async function analyzeTypeScriptSources(
	input: AnalysisInput,
): Promise<AnalysisResult> {
	const sourceFiles = input.snapshot.files.filter((file) =>
		SOURCE_EXTENSIONS.has(extname(file.path)),
	);
	if (sourceFiles.length === 0) {
		return { modules: [], diagnostics: [] };
	}

	const compilerOptions = loadCompilerOptions(input.projectRoot);
	const compilerHost = ts.createCompilerHost(compilerOptions, true);
	const program = ts.createProgram({
		rootNames: sourceFiles.map((file) => resolve(input.projectRoot, file.path)),
		options: compilerOptions,
		host: compilerHost,
	});
	const checker = program.getTypeChecker();
	const sourceLookup = createSourceLookup(input.projectRoot, sourceFiles);
	const moduleRoots = discoverModuleRoots(input.config, sourceFiles);
	const moduleFiles = assignFilesToModules(moduleRoots, sourceFiles);
	const fileToModule = mapFilesToModules(moduleFiles);

	const modules: ModuleSkeleton[] = [];
	for (const rootDir of moduleRoots) {
		const files = moduleFiles.get(rootDir) ?? [];
		if (files.length === 0) continue;

		const hasBarrel = files.some((file) =>
			BARREL_FILENAMES.has(basename(file)),
		);
		const publicFiles = hasBarrel
			? files.filter((file) => BARREL_FILENAMES.has(basename(file)))
			: files.filter((file) => !isTestSource(file));
		const publicInterface = collectPublicInterface({
			checker,
			program,
			projectRoot: input.projectRoot,
			files: publicFiles,
			sourceLookup,
		});
		const { dependencies, externalDependencies } = collectDependencies({
			compilerHost,
			compilerOptions,
			fileToModule,
			files,
			program,
			projectRoot: input.projectRoot,
			sourceLookup,
			sourceModule: rootDir,
		});
		const moduleSourceFiles = sourceFiles.filter((file) =>
			files.includes(file.path),
		);
		const sourceHash = hashSourceFiles(moduleSourceFiles);
		const skeletonCore = {
			resource: rootDir,
			rootDir,
			files,
			hasBarrel,
			publicInterface,
			dependencies,
			externalDependencies,
		};

		modules.push({
			...skeletonCore,
			sourceHash,
			skeletonHash: hashJson(skeletonCore),
		});
	}

	return { modules: modules.sort(compareByResource), diagnostics: [] };
}

function loadCompilerOptions(projectRoot: string): ts.CompilerOptions {
	const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists);
	const defaults = defaultCompilerOptions(projectRoot);
	if (!configPath) return defaults;

	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	if (configFile.error) return defaults;

	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(configPath),
		defaults,
		configPath,
	);
	return {
		...defaults,
		...parsed.options,
		noEmit: true,
	};
}

function defaultCompilerOptions(projectRoot: string): ts.CompilerOptions {
	return {
		allowImportingTsExtensions: true,
		baseUrl: projectRoot,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		noEmit: true,
		skipLibCheck: true,
		strict: true,
		target: ts.ScriptTarget.ES2023,
	};
}

function discoverModuleRoots(
	config: ArchitectureMapConfig,
	sourceFiles: readonly SourceFileSnapshot[],
): readonly string[] {
	if (config.moduleRoots && config.moduleRoots.length > 0) {
		return [...config.moduleRoots]
			.filter((root) =>
				sourceFiles.some((file) => isInsideOrEqualRepoPath(root, file.path)),
			)
			.sort();
	}

	const roots = new Set<string>();
	for (const sourceRoot of config.sourceRoots) {
		const filesUnderRoot = sourceFiles.filter((file) =>
			isInsideOrEqualRepoPath(sourceRoot, file.path),
		);
		for (const file of filesUnderRoot) {
			const rest = relativeRepoPath(sourceRoot, file.path);
			const firstSegment = rest.split("/")[0];
			if (!firstSegment || !rest.includes("/")) {
				roots.add(sourceRoot);
				continue;
			}
			roots.add(joinRepoPath(sourceRoot, firstSegment));
		}
	}
	return [...roots].sort();
}

function assignFilesToModules(
	moduleRoots: readonly string[],
	sourceFiles: readonly SourceFileSnapshot[],
): Map<string, readonly string[]> {
	const moduleFiles = new Map<string, readonly string[]>();
	for (const root of moduleRoots) {
		moduleFiles.set(
			root,
			sourceFiles
				.filter((file) => isInsideOrEqualRepoPath(root, file.path))
				.map((file) => file.path)
				.sort(),
		);
	}
	return moduleFiles;
}

function mapFilesToModules(
	moduleFiles: Map<string, readonly string[]>,
): Map<string, string> {
	const fileToModule = new Map<string, string>();
	const entries = [...moduleFiles.entries()].sort(
		([left], [right]) => right.length - left.length,
	);
	for (const [resource, files] of entries) {
		for (const file of files) {
			if (!fileToModule.has(file)) fileToModule.set(file, resource);
		}
	}
	return fileToModule;
}

function collectPublicInterface(options: {
	readonly checker: ts.TypeChecker;
	readonly program: ts.Program;
	readonly projectRoot: string;
	readonly files: readonly string[];
	readonly sourceLookup: Map<string, string>;
}): readonly PublicExport[] {
	const exports = new Map<string, PublicExport>();
	for (const file of options.files) {
		const sourceFile = options.program.getSourceFile(
			resolve(options.projectRoot, file),
		);
		if (!sourceFile) continue;
		const moduleSymbol = options.checker.getSymbolAtLocation(sourceFile);
		if (!moduleSymbol) continue;

		for (const exportSymbol of options.checker.getExportsOfModule(
			moduleSymbol,
		)) {
			const publicExport = toPublicExport(exportSymbol, sourceFile, options);
			if (!publicExport) continue;
			exports.set(
				`${publicExport.name}\0${publicExport.sourceFile}`,
				publicExport,
			);
		}
	}

	return [...exports.values()].sort(comparePublicExports);
}

function toPublicExport(
	exportSymbol: ts.Symbol,
	fallbackSourceFile: ts.SourceFile,
	options: {
		readonly checker: ts.TypeChecker;
		readonly projectRoot: string;
		readonly sourceLookup: Map<string, string>;
	},
): PublicExport | undefined {
	const symbol =
		exportSymbol.flags & ts.SymbolFlags.Alias
			? options.checker.getAliasedSymbol(exportSymbol)
			: exportSymbol;
	const declaration = selectPublicDeclaration(symbol, exportSymbol);
	if (!declaration) return undefined;

	const sourceFile = declaration.getSourceFile() ?? fallbackSourceFile;
	return {
		name: exportSymbol.getName(),
		kind: publicExportKind(declaration),
		signature: declarationSignature(
			declaration,
			exportSymbol.getName(),
			options.checker,
		),
		sourceFile:
			options.sourceLookup.get(normalizeAbsolutePath(sourceFile.fileName)) ??
			toRepoRelativePath(options.projectRoot, sourceFile.fileName),
	};
}

function selectPublicDeclaration(
	symbol: ts.Symbol,
	fallbackSymbol: ts.Symbol,
): ts.Declaration | undefined {
	const declarations =
		symbol.getDeclarations() ?? fallbackSymbol.getDeclarations();
	return declarations?.find(
		(declaration) => !ts.isExportSpecifier(declaration),
	);
}

function publicExportKind(declaration: ts.Declaration): PublicExport["kind"] {
	if (ts.isFunctionDeclaration(declaration)) return "function";
	if (ts.isClassDeclaration(declaration)) return "class";
	if (ts.isInterfaceDeclaration(declaration)) return "interface";
	if (ts.isTypeAliasDeclaration(declaration)) return "type";
	if (ts.isVariableDeclaration(declaration)) return "const";
	if (ts.isEnumDeclaration(declaration)) return "enum";
	return "other";
}

function declarationSignature(
	declaration: ts.Declaration,
	name: string,
	checker: ts.TypeChecker,
): string {
	if (ts.isFunctionDeclaration(declaration)) {
		const signature = checker.getSignatureFromDeclaration(declaration);
		const rendered = signature
			? checker.signatureToString(signature)
			: "() => unknown";
		return `export function ${name}${rendered};`;
	}
	if (ts.isVariableDeclaration(declaration)) {
		const type = declaration.type
			? declaration.type.getText(declaration.getSourceFile())
			: checker.typeToString(checker.getTypeAtLocation(declaration.name));
		return `export const ${name}: ${type};`;
	}
	if (ts.isClassDeclaration(declaration)) {
		return collapseWhitespace(`export class ${name}`);
	}
	return collapseWhitespace(declaration.getText(declaration.getSourceFile()));
}

function collectDependencies(options: {
	readonly compilerHost: ts.CompilerHost;
	readonly compilerOptions: ts.CompilerOptions;
	readonly fileToModule: Map<string, string>;
	readonly files: readonly string[];
	readonly program: ts.Program;
	readonly projectRoot: string;
	readonly sourceLookup: Map<string, string>;
	readonly sourceModule: string;
}): {
	readonly dependencies: readonly ModuleDependency[];
	readonly externalDependencies: readonly string[];
} {
	const internal = new Map<string, Set<string>>();
	const external = new Set<string>();

	for (const file of options.files) {
		const sourceFile = options.program.getSourceFile(
			resolve(options.projectRoot, file),
		);
		if (!sourceFile) continue;

		for (const specifier of collectModuleSpecifiers(sourceFile)) {
			recordDependencySpecifier({
				...options,
				file,
				sourceFile,
				specifier,
				internal,
				external,
			});
		}
	}

	return {
		dependencies: [...internal.entries()]
			.map(([resource, importedBy]) => ({
				resource,
				importedBy: [...importedBy].sort(),
			}))
			.sort(compareModuleDependencies),
		externalDependencies: [...external].sort(),
	};
}

function recordDependencySpecifier(options: {
	readonly compilerHost: ts.CompilerHost;
	readonly compilerOptions: ts.CompilerOptions;
	readonly external: Set<string>;
	readonly file: string;
	readonly fileToModule: Map<string, string>;
	readonly internal: Map<string, Set<string>>;
	readonly sourceFile: ts.SourceFile;
	readonly sourceLookup: Map<string, string>;
	readonly sourceModule: string;
	readonly specifier: string;
}): void {
	const resolved = ts.resolveModuleName(
		options.specifier,
		options.sourceFile.fileName,
		options.compilerOptions,
		options.compilerHost,
	).resolvedModule;
	const resolvedRepoPath = resolved
		? options.sourceLookup.get(normalizeAbsolutePath(resolved.resolvedFileName))
		: undefined;
	const targetModule = resolvedRepoPath
		? options.fileToModule.get(resolvedRepoPath)
		: undefined;

	if (targetModule && targetModule !== options.sourceModule) {
		const importedBy = options.internal.get(targetModule) ?? new Set<string>();
		importedBy.add(options.file);
		options.internal.set(targetModule, importedBy);
		return;
	}

	if (!isRelativeModuleSpecifier(options.specifier)) {
		options.external.add(externalDependencyName(options.specifier));
	}
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
	const specifiers: string[] = [];
	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier)
		) {
			specifiers.push(statement.moduleSpecifier.text);
		}
		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier)
		) {
			specifiers.push(statement.moduleSpecifier.text);
		}
	}
	return specifiers.sort();
}

function createSourceLookup(
	projectRoot: string,
	sourceFiles: readonly SourceFileSnapshot[],
): Map<string, string> {
	return new Map(
		sourceFiles.map((file) => [
			normalizeAbsolutePath(resolve(projectRoot, file.path)),
			file.path,
		]),
	);
}

async function collectTsconfigInputs(
	projectRoot: string,
	repoPath: string,
	inputs: Set<string>,
	seen: Set<string>,
): Promise<void> {
	const normalized = normalizeRepoPath(repoPath);
	if (seen.has(normalized)) return;
	seen.add(normalized);
	const added = await addIfFile(projectRoot, normalized, inputs);
	if (!added) return;

	const absolute = resolve(projectRoot, normalized);
	const raw = await readFile(absolute, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	const extensions = tsconfigExtends(parsed);
	for (const extension of extensions) {
		const extendedPath = resolveTsconfigExtends(
			projectRoot,
			absolute,
			extension,
		);
		if (extendedPath) {
			await collectTsconfigInputs(projectRoot, extendedPath, inputs, seen);
		}
	}
}

async function addIfFile(
	projectRoot: string,
	repoPath: string,
	inputs: Set<string>,
): Promise<boolean> {
	try {
		const fileStat = await stat(resolve(projectRoot, repoPath));
		if (!fileStat.isFile()) return false;
		inputs.add(normalizeRepoPath(repoPath));
		return true;
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return false;
		}
		throw error;
	}
}

function tsconfigExtends(parsed: unknown): readonly string[] {
	if (!parsed || typeof parsed !== "object" || !("extends" in parsed)) {
		return [];
	}
	const value = (parsed as { extends?: unknown }).extends;
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return [];
}

function resolveTsconfigExtends(
	projectRoot: string,
	configPath: string,
	extension: string,
): string | undefined {
	if (!extension.startsWith(".") && !isAbsolute(extension)) return undefined;
	const candidate = isAbsolute(extension)
		? extension
		: resolve(dirname(configPath), extension);
	const withJson = extname(candidate) ? candidate : `${candidate}.json`;
	const rel = relative(projectRoot, withJson);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
	return normalizeRepoPath(rel);
}

function hashSourceFiles(files: readonly SourceFileSnapshot[]): string {
	const hash = createHash("sha256");
	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update("\0");
		hash.update(file.hash);
		hash.update("\0");
	}
	return hash.digest("hex");
}

function hashJson(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compareByResource(
	left: ModuleSkeleton,
	right: ModuleSkeleton,
): number {
	return left.resource.localeCompare(right.resource);
}

function comparePublicExports(left: PublicExport, right: PublicExport): number {
	return (
		left.name.localeCompare(right.name) ||
		left.sourceFile.localeCompare(right.sourceFile)
	);
}

function compareModuleDependencies(
	left: ModuleDependency,
	right: ModuleDependency,
): number {
	return left.resource.localeCompare(right.resource);
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function isTestSource(path: string): boolean {
	const segments = path.split("/");
	const file = segments.at(-1) ?? "";
	return (
		segments.includes("__tests__") ||
		file.endsWith(".test.ts") ||
		file.endsWith(".test.tsx") ||
		file.endsWith(".spec.ts") ||
		file.endsWith(".spec.tsx")
	);
}

function isRelativeModuleSpecifier(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function externalDependencyName(specifier: string): string {
	const parts = specifier.split("/");
	if (specifier.startsWith("@") && parts.length >= 2) {
		return `${parts[0]}/${parts[1]}`;
	}
	return parts[0] ?? specifier;
}

function isInsideOrEqualRepoPath(root: string, path: string): boolean {
	if (root === ".") return true;
	return path === root || path.startsWith(`${root}/`);
}

function relativeRepoPath(root: string, path: string): string {
	if (root === ".") return path;
	return path.slice(root.length + 1);
}

function joinRepoPath(...parts: readonly string[]): string {
	return parts.filter((part) => part.length > 0 && part !== ".").join("/");
}

function normalizeRepoPath(path: string): string {
	return path.split(/[\\/]+/u).join("/");
}

function normalizeAbsolutePath(path: string): string {
	return resolve(path)
		.split(/[\\/]+/u)
		.join("/");
}

function toRepoRelativePath(projectRoot: string, absolute: string): string {
	return normalizeRepoPath(relative(projectRoot, absolute));
}
