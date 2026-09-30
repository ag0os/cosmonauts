import * as ts from "typescript";
import { publicExportKind } from "./analyzer.ts";
import type { FileGraphExport, FileGraphExportKind } from "./types.ts";

const MAX_SIGNATURE_LENGTH = 240;
const MAX_TYPE_BODY_LENGTH = 80;
const ELLIPSIS = "…";

/**
 * Lists the declarations a file itself exports, with one-line signatures.
 * Re-exported declarations belong to their own file and are skipped here.
 */
export function collectFileExports(
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
): readonly FileGraphExport[] {
	const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
	if (!moduleSymbol) return [];

	const exports = new Map<string, FileGraphExport>();
	for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
		for (const entry of exportEntries(checker, exportSymbol, sourceFile)) {
			const key = `${entry.name}\0${entry.kind}`;
			if (!exports.has(key)) exports.set(key, entry);
		}
	}
	return [...exports.values()].sort(compareExports);
}

function exportEntries(
	checker: ts.TypeChecker,
	exportSymbol: ts.Symbol,
	sourceFile: ts.SourceFile,
): readonly FileGraphExport[] {
	const symbol =
		exportSymbol.flags & ts.SymbolFlags.Alias
			? checker.getAliasedSymbol(exportSymbol)
			: exportSymbol;
	const name = exportSymbol.getName();
	const entries: FileGraphExport[] = [];
	for (const declaration of symbol.getDeclarations() ?? []) {
		if (declaration.getSourceFile() !== sourceFile) continue;
		const kind = exportKind(declaration);
		if (!kind) continue;
		entries.push({
			name,
			kind,
			signature: truncate(
				collapseWhitespace(renderSignature(checker, declaration, name)),
				MAX_SIGNATURE_LENGTH,
			),
		});
	}
	return entries;
}

function exportKind(
	declaration: ts.Declaration,
): FileGraphExportKind | undefined {
	const kind = publicExportKind(declaration);
	return kind === "other" ? undefined : kind;
}

function renderSignature(
	checker: ts.TypeChecker,
	declaration: ts.Declaration,
	exportName: string,
): string {
	const name = displayName(declaration, exportName);
	const body = renderDeclaration(checker, declaration, name);
	return name === undefined ? `export default ${body}` : body;
}

function displayName(
	declaration: ts.Declaration,
	exportName: string,
): string | undefined {
	if (exportName !== "default") return exportName;
	const local = ts.getNameOfDeclaration(declaration);
	return local && ts.isIdentifier(local) ? local.text : undefined;
}

function renderDeclaration(
	checker: ts.TypeChecker,
	declaration: ts.Declaration,
	name: string | undefined,
): string {
	if (ts.isFunctionDeclaration(declaration)) {
		return functionSignature(checker, declaration, name);
	}
	if (ts.isVariableDeclaration(declaration)) {
		return variableSignature(checker, declaration, name);
	}
	if (ts.isClassDeclaration(declaration)) {
		return classHeader(declaration, name);
	}
	if (ts.isInterfaceDeclaration(declaration)) {
		return `${keywordWithName("interface", name)}${typeParameters(declaration)}${heritage(declaration)}`;
	}
	if (ts.isTypeAliasDeclaration(declaration)) {
		return `${keywordWithName("type", name)}${typeParameters(declaration)} = ${elideTypeBody(declaration.type)}`;
	}
	if (ts.isEnumDeclaration(declaration)) return enumHeader(declaration, name);
	return name ?? "default";
}

function keywordWithName(keyword: string, name: string | undefined): string {
	return name === undefined ? keyword : `${keyword} ${name}`;
}

function functionSignature(
	checker: ts.TypeChecker,
	declaration: ts.FunctionDeclaration,
	name: string | undefined,
): string {
	const signature = checker.getSignatureFromDeclaration(declaration);
	const rendered = signature
		? checker.signatureToString(
				signature,
				undefined,
				ts.TypeFormatFlags.NoTruncation,
			)
		: "(): unknown";
	const asyncPrefix = hasModifier(declaration, ts.SyntaxKind.AsyncKeyword)
		? "async "
		: "";
	return `${asyncPrefix}${keywordWithName("function", name)}${rendered}`;
}

function variableSignature(
	checker: ts.TypeChecker,
	declaration: ts.VariableDeclaration,
	name: string | undefined,
): string {
	const type = declaration.type
		? declaration.type.getText()
		: checker.typeToString(
				checker.getTypeAtLocation(declaration.name),
				undefined,
				ts.TypeFormatFlags.NoTruncation,
			);
	return `${keywordWithName(variableKeyword(declaration), name)}: ${type}`;
}

function variableKeyword(declaration: ts.VariableDeclaration): string {
	const list = declaration.parent;
	if (!ts.isVariableDeclarationList(list)) return "const";
	if (list.flags & ts.NodeFlags.Const) return "const";
	if (list.flags & ts.NodeFlags.Let) return "let";
	return "var";
}

function classHeader(
	declaration: ts.ClassDeclaration,
	name: string | undefined,
): string {
	const abstractPrefix = hasModifier(declaration, ts.SyntaxKind.AbstractKeyword)
		? "abstract "
		: "";
	return `${abstractPrefix}${keywordWithName("class", name)}${typeParameters(declaration)}${heritage(declaration)}`;
}

function enumHeader(
	declaration: ts.EnumDeclaration,
	name: string | undefined,
): string {
	const constPrefix = hasModifier(declaration, ts.SyntaxKind.ConstKeyword)
		? "const "
		: "";
	return `${constPrefix}${keywordWithName("enum", name)}`;
}

function typeParameters(
	declaration:
		| ts.ClassDeclaration
		| ts.InterfaceDeclaration
		| ts.TypeAliasDeclaration,
): string {
	const parameters = declaration.typeParameters;
	if (!parameters || parameters.length === 0) return "";
	return `<${parameters.map((parameter) => parameter.getText()).join(", ")}>`;
}

function heritage(
	declaration: ts.ClassDeclaration | ts.InterfaceDeclaration,
): string {
	const clauses = declaration.heritageClauses ?? [];
	return clauses.map((clause) => ` ${clause.getText()}`).join("");
}

function elideTypeBody(type: ts.TypeNode): string {
	if (ts.isTypeLiteralNode(type)) return `{ ${ELLIPSIS} }`;
	const body = collapseWhitespace(type.getText())
		.replace(/^\| /u, "")
		.replace(/<\s+/gu, "<")
		.replace(/\s+>/gu, ">");
	return truncate(body, MAX_TYPE_BODY_LENGTH);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	if (!ts.canHaveModifiers(node)) return false;
	return (ts.getModifiers(node) ?? []).some(
		(modifier) => modifier.kind === kind,
	);
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength).trimEnd()} ${ELLIPSIS}`;
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function compareExports(left: FileGraphExport, right: FileGraphExport): number {
	return (
		compareStrings(left.name, right.name) ||
		compareStrings(left.kind, right.kind)
	);
}

function compareStrings(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
