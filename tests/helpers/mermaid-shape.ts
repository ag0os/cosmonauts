/**
 * A shape check of the Mermaid flowchart subset renderChangeDiagram emits,
 * not a Mermaid parser: every line must be a known statement, subgraphs must
 * balance, ids must be Mermaid-safe, and every class target and class name
 * must be declared. It rejects valid Mermaid outside that subset, so it is
 * run only on diagrams built from that subset. Parsing the outputs with the
 * real Mermaid parser is a pending integration item.
 */

const ID = "[A-Za-z0-9_]+";
const LABEL = `\\[(?:"[^"]*"|[^\\]"]*)\\]`;
const NODE = `(${ID})(?:${LABEL})?`;

const HEADER = /^(graph|flowchart) (LR|RL|TB|TD|BT)$/;
const SUBGRAPH = new RegExp(`^subgraph (${ID})(?:\\["[^"]*"\\])?$`);
const NODE_LINE = new RegExp(`^${NODE}$`);
const EDGE_LINE = new RegExp(`^${NODE}\\s*-->\\s*${NODE}$`);
const CLASS_DEF = new RegExp(`^classDef (${ID}) \\S.*$`);
const CLASS_LINE = new RegExp(`^class (${ID}(?:,${ID})*) (${ID})$`);

interface Scan {
	readonly declared: Set<string>;
	readonly referenced: Set<string>;
	readonly classDefs: Set<string>;
	readonly classUses: { ids: string[]; name: string; line: number }[];
	readonly errors: string[];
	depth: number;
}

export function mermaidShapeErrors(source: string): string[] {
	const [header = "", ...body] = source.split("\n");
	const scan: Scan = {
		declared: new Set(),
		referenced: new Set(),
		classDefs: new Set(),
		classUses: [],
		errors: [],
		depth: 0,
	};
	if (!HEADER.test(header.trim())) scan.errors.push(`bad header: ${header}`);
	body.forEach((line, index) => {
		scanLine(scan, line.trim(), index + 2);
	});
	if (scan.depth !== 0) scan.errors.push(`unclosed subgraphs: ${scan.depth}`);
	return [...scan.errors, ...referenceErrors(scan)];
}

function scanLine(scan: Scan, line: string, lineNumber: number): void {
	if (line === "" || line.startsWith("%%")) return;
	if (line === "end") {
		scan.depth -= 1;
		if (scan.depth < 0) scan.errors.push(`line ${lineNumber}: stray end`);
		return;
	}
	const subgraph = SUBGRAPH.exec(line);
	if (subgraph) {
		scan.depth += 1;
		scan.declared.add(subgraph[1] as string);
		return;
	}
	if (scanStatement(scan, line, lineNumber)) return;
	scan.errors.push(`line ${lineNumber}: unrecognized statement: ${line}`);
}

function scanStatement(scan: Scan, line: string, lineNumber: number): boolean {
	const node = NODE_LINE.exec(line);
	if (node) {
		scan.declared.add(node[1] as string);
		return true;
	}
	const edge = EDGE_LINE.exec(line);
	if (edge) {
		for (const id of [edge[1], edge[2]] as string[]) scan.referenced.add(id);
		return true;
	}
	const classDef = CLASS_DEF.exec(line);
	if (classDef) {
		scan.classDefs.add(classDef[1] as string);
		return true;
	}
	const classLine = CLASS_LINE.exec(line);
	if (classLine) {
		const ids = (classLine[1] as string).split(",");
		scan.classUses.push({
			ids,
			name: classLine[2] as string,
			line: lineNumber,
		});
		return true;
	}
	return false;
}

function referenceErrors(scan: Scan): string[] {
	const errors: string[] = [];
	const known = new Set([...scan.declared, ...scan.referenced]);
	for (const id of known) {
		if (id === "end") errors.push(`reserved id: ${id}`);
	}
	for (const use of scan.classUses) {
		if (!scan.classDefs.has(use.name)) {
			errors.push(`line ${use.line}: class ${use.name} has no classDef`);
		}
		for (const id of use.ids) {
			if (!known.has(id)) errors.push(`line ${use.line}: undeclared ${id}`);
		}
	}
	return errors;
}
