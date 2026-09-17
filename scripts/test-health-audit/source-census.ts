import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";

export type DeclarationMode = "run" | "skip" | "todo" | "only" | "conditional";
export interface AssertionCandidate {
	readonly line: number;
	readonly conditional: boolean;
}
export interface SourceDeclaration {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	readonly titleTemplate: string;
	readonly ordinal: number;
	readonly line: number;
	readonly endLine: number;
	readonly mode: DeclarationMode;
	readonly parameterCount: number | null;
	readonly assertionCandidates: readonly AssertionCandidate[];
}
export interface SourceLimitation {
	readonly kind: "unsupported-syntax";
	readonly path: string;
	readonly line: number;
	readonly basis: "blocked";
	readonly detail: string;
}
export interface SourceCensus {
	readonly path: string;
	readonly declarations: readonly SourceDeclaration[];
	readonly limitations: readonly SourceLimitation[];
}
interface Registration {
	readonly base: string;
	readonly mode: DeclarationMode;
	readonly title: ts.Expression | undefined;
	readonly callback: ts.Node | undefined;
	readonly parameterCount: number | null;
}

export function collectSourceText(path: string, source: string): SourceCensus {
	const file = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const tests = new Set<string>();
	const suites = new Set<string>();
	const expects = new Set<string>();
	const declarations: SourceDeclaration[] = [];
	const limitations: SourceLimitation[] = [];
	const ordinals = new Map<string, number>();
	const parseDiagnostics = (
		file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
	).parseDiagnostics;
	for (const diagnostic of parseDiagnostics) {
		const position = diagnostic.start ?? 0;
		limitations.push({
			kind: "unsupported-syntax",
			path,
			line: file.getLineAndCharacterOfPosition(position).line + 1,
			basis: "blocked",
			detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
		});
	}
	for (const statement of file.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			staticText(statement.moduleSpecifier) !== "vitest"
		)
			continue;
		const bindings = statement.importClause?.namedBindings;
		if (!bindings) continue;
		if (ts.isNamespaceImport(bindings)) {
			addImportLimitation(
				statement,
				"namespace Vitest imports are outside the bounded collector",
			);
			continue;
		}
		for (const element of bindings.elements) {
			const imported = element.propertyName?.text ?? element.name.text;
			if (imported === "test" || imported === "it")
				tests.add(element.name.text);
			if (imported === "describe" || imported === "suite")
				suites.add(element.name.text);
			if (imported === "expect") expects.add(element.name.text);
		}
	}
	function addLimitation(node: ts.Node, detail: string): void {
		limitations.push({
			kind: "unsupported-syntax",
			path,
			line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
			basis: "blocked",
			detail,
		});
	}
	function addImportLimitation(node: ts.Node, detail: string): void {
		limitations.push({
			kind: "unsupported-syntax",
			path,
			line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
			basis: "blocked",
			detail,
		});
	}
	function walk(node: ts.Node, parents: readonly string[]): void {
		if (ts.isCallExpression(node)) {
			const registration = parseRegistration(node, tests, suites);
			if (registration && suites.has(registration.base)) {
				if (registration.parameterCount === null)
					addLimitation(node, "parameter set is not statically countable");
				const title = staticText(registration.title);
				if (title === undefined)
					addLimitation(node, "suite title is not a static string");
				if (registration.callback)
					walk(
						registration.callback,
						title === undefined ? parents : [...parents, title],
					);
				return;
			}
			if (registration && tests.has(registration.base)) {
				if (registration.parameterCount === null)
					addLimitation(node, "parameter set is not statically countable");
				const titleTemplate = staticText(registration.title);
				if (titleTemplate === undefined) {
					addLimitation(node, "test title is not a static string");
					return;
				}
				const title = [...parents, titleTemplate].join(" > ");
				const ordinal = (ordinals.get(title) ?? 0) + 1;
				ordinals.set(title, ordinal);
				const start = file.getLineAndCharacterOfPosition(node.getStart(file));
				const end = file.getLineAndCharacterOfPosition(node.getEnd());
				declarations.push({
					id: createHash("sha256")
						.update(`${path}\0${title}\0${ordinal}`)
						.digest("hex"),
					path,
					title,
					titleTemplate,
					ordinal,
					line: start.line + 1,
					endLine: end.line + 1,
					mode: registration.mode,
					parameterCount: registration.parameterCount,
					assertionCandidates: registration.callback
						? collectAssertions(registration.callback, expects, file)
						: [],
				});
				return;
			}
			if (hasRegistrationRoot(node.expression, tests, suites)) {
				addLimitation(
					node,
					"test or suite registration uses an unsupported call shape",
				);
				return;
			}
		}
		ts.forEachChild(node, (child) => walk(child, parents));
	}
	file.statements.forEach((statement) => {
		walk(statement, []);
	});
	return { path, declarations, limitations };
}

export async function collectSourceTree(
	projectRoot: string,
): Promise<SourceCensus[]> {
	const testsRoot = join(projectRoot, "tests");
	const paths = await findTestFiles(testsRoot);
	return Promise.all(
		paths.map(async (absolutePath) =>
			collectSourceText(
				relative(projectRoot, absolutePath).replaceAll("\\", "/"),
				await readFile(absolutePath, "utf8"),
			),
		),
	);
}

async function findTestFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry): Promise<string[]> => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return findTestFiles(path);
			return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
		}),
	);
	return files.flat().sort();
}

function parseRegistration(
	call: ts.CallExpression,
	tests: ReadonlySet<string>,
	suites: ReadonlySet<string>,
): Registration | undefined {
	const expression = call.expression;
	const args = call.arguments;
	if (ts.isCallExpression(expression)) {
		if (!ts.isPropertyAccessExpression(expression.expression)) return undefined;
		const property = expression.expression.name.text;
		const base = identifierText(expression.expression.expression);
		if (!base || (!tests.has(base) && !suites.has(base))) return undefined;
		if (property === "each")
			return {
				base,
				mode: "run",
				title: args[0],
				callback: args.at(-1),
				parameterCount: countEachParameters(expression.arguments[0]),
			};
		if (property === "runIf" || property === "skipIf")
			return {
				base,
				mode: "conditional",
				title: args[0],
				callback: args.at(-1),
				parameterCount: 1,
			};
		return undefined;
	}
	if (ts.isTaggedTemplateExpression(expression)) {
		if (!ts.isPropertyAccessExpression(expression.tag)) return undefined;
		const base = identifierText(expression.tag.expression);
		if (
			!base ||
			(!tests.has(base) && !suites.has(base)) ||
			expression.tag.name.text !== "each"
		)
			return undefined;
		return {
			base,
			mode: "run",
			title: args[0],
			callback: args.at(-1),
			parameterCount: countEachTemplate(expression.template),
		};
	}
	if (ts.isPropertyAccessExpression(expression)) {
		const base = identifierText(expression.expression);
		const property = expression.name.text;
		if (
			!base ||
			(!tests.has(base) && !suites.has(base)) ||
			!["skip", "todo", "only"].includes(property)
		)
			return undefined;
		return {
			base,
			mode: property as DeclarationMode,
			title: args[0],
			callback: args.at(-1),
			parameterCount: 1,
		};
	}
	const base = identifierText(expression);
	return base && (tests.has(base) || suites.has(base))
		? {
				base,
				mode: "run",
				title: args[0],
				callback: args.at(-1),
				parameterCount: 1,
			}
		: undefined;
}
function identifierText(expression: ts.Expression): string | undefined {
	return ts.isIdentifier(expression) ? expression.text : undefined;
}
function hasRegistrationRoot(
	expression: ts.Expression,
	tests: ReadonlySet<string>,
	suites: ReadonlySet<string>,
): boolean {
	if (ts.isIdentifier(expression))
		return tests.has(expression.text) || suites.has(expression.text);
	if (ts.isPropertyAccessExpression(expression))
		return hasRegistrationRoot(expression.expression, tests, suites);
	if (ts.isCallExpression(expression))
		return hasRegistrationRoot(expression.expression, tests, suites);
	if (ts.isTaggedTemplateExpression(expression))
		return hasRegistrationRoot(expression.tag, tests, suites);
	return false;
}
function staticText(expression: ts.Expression | undefined): string | undefined {
	return expression &&
		(ts.isStringLiteral(expression) ||
			ts.isNoSubstitutionTemplateLiteral(expression))
		? expression.text
		: undefined;
}
function countEachParameters(
	expression: ts.Expression | undefined,
): number | null {
	if (!expression) return null;
	expression = unwrapExpression(expression);
	if (
		ts.isArrayLiteralExpression(expression) &&
		!containsSpreadElement(expression)
	)
		return expression.elements.length;
	if (ts.isTaggedTemplateExpression(expression)) {
		return countEachTemplate(expression.template);
	}
	return null;
}
function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isTypeAssertionExpression(current)
	)
		current = current.expression;
	return current;
}
function containsSpreadElement(node: ts.Node): boolean {
	if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return true;
	return node.getChildren().some(containsSpreadElement);
}
function countEachTemplate(template: ts.TemplateLiteral): number {
	const text = template.getText().slice(1, -1).trim();
	return text === "" ? 0 : Math.max(0, text.split("\n").length - 1);
}
function collectAssertions(
	root: ts.Node,
	expects: ReadonlySet<string>,
	file: ts.SourceFile,
): AssertionCandidate[] {
	const assertions: AssertionCandidate[] = [];
	function visit(node: ts.Node, conditional: boolean): void {
		const next =
			conditional ||
			ts.isIfStatement(node) ||
			ts.isConditionalExpression(node) ||
			ts.isSwitchStatement(node) ||
			ts.isForStatement(node) ||
			ts.isForOfStatement(node) ||
			ts.isForInStatement(node) ||
			ts.isWhileStatement(node);
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			expects.has(node.expression.text)
		)
			assertions.push({
				line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
				conditional,
			});
		ts.forEachChild(node, (child) => visit(child, next));
	}
	visit(root, false);
	return assertions;
}
