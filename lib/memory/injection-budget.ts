export interface InjectionSection {
	readonly id: string;
	readonly content: string;
	readonly detailTool: string;
}

export interface InjectionAllocation {
	readonly originalBytes: number;
	readonly renderedBytes: number;
	readonly truncated: boolean;
}

export interface InjectionBudgetResult {
	readonly content: string | undefined;
	readonly allocations: Readonly<Record<string, InjectionAllocation>>;
}

/** Pure fair-share allocator for one provider-visible UTF-8 budget. */
export function allocateInjectionBudget(options: {
	readonly sections: readonly InjectionSection[];
	readonly maxBytes: number;
	readonly prefix?: string;
	readonly separator?: string;
}): InjectionBudgetResult {
	const sections = options.sections.filter(
		(section) => section.content.trim().length > 0,
	);
	if (sections.length === 0) return { content: undefined, allocations: {} };

	const prefix = options.prefix ?? "";
	const separator = options.separator ?? "\n\n";
	const framingBytes =
		byteLength(prefix) +
		byteLength(separator) * Math.max(0, sections.length - 1);
	const available = Math.max(0, options.maxBytes - framingBytes);
	const caps = fairCaps(
		sections.map((section) => byteLength(section.content)),
		available,
	);
	const allocations: Record<string, InjectionAllocation> = {};
	const rendered = sections.map((section, index) => {
		const originalBytes = byteLength(section.content);
		const content = renderSectionWithin({
			section,
			maxBytes: caps[index] ?? 0,
		});
		allocations[section.id] = {
			originalBytes,
			renderedBytes: byteLength(content),
			truncated: originalBytes > byteLength(content),
		};
		return content;
	});
	const combined = `${prefix}${rendered.join(separator)}`;
	return {
		content:
			byteLength(combined) <= options.maxBytes
				? combined
				: truncateUtf8(combined, options.maxBytes),
		allocations,
	};
}

function fairCaps(sizes: readonly number[], total: number): number[] {
	const caps = sizes.map(() => 0);
	let remainingBudget = total;
	let remaining = sizes.map((size, index) => ({ size, index }));

	while (remaining.length > 0) {
		const share = Math.floor(remainingBudget / remaining.length);
		const complete = remaining.filter(({ size }) => size <= share);
		if (complete.length === 0) {
			for (const { index } of remaining) caps[index] = share;
			let remainder = remainingBudget - share * remaining.length;
			for (const { index } of remaining) {
				if (remainder <= 0) break;
				caps[index] = (caps[index] ?? 0) + 1;
				remainder -= 1;
			}
			break;
		}

		const completed = new Set(complete.map(({ index }) => index));
		for (const { size, index } of complete) {
			caps[index] = size;
			remainingBudget -= size;
		}
		remaining = remaining.filter(({ index }) => !completed.has(index));
	}

	return caps;
}

function renderSectionWithin(options: {
	readonly section: InjectionSection;
	readonly maxBytes: number;
}): string {
	const originalBytes = byteLength(options.section.content);
	if (originalBytes <= options.maxBytes) return options.section.content;

	let included = 0;
	let footer = truncationFooter(options.section, originalBytes, included);
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const contentBudget = Math.max(0, options.maxBytes - byteLength(footer));
		const excerpt = truncateUtf8(options.section.content, contentBudget);
		const nextIncluded = byteLength(excerpt);
		const nextFooter = truncationFooter(
			options.section,
			originalBytes,
			nextIncluded,
		);
		if (nextIncluded === included && nextFooter === footer) {
			return truncateUtf8(`${excerpt}${footer}`, options.maxBytes);
		}
		included = nextIncluded;
		footer = nextFooter;
	}
	const excerpt = truncateUtf8(
		options.section.content,
		Math.max(0, options.maxBytes - byteLength(footer)),
	);
	return truncateUtf8(`${excerpt}${footer}`, options.maxBytes);
}

function truncationFooter(
	section: InjectionSection,
	originalBytes: number,
	includedBytes: number,
): string {
	return `\n[${section.id} truncated from ${originalBytes} UTF-8 bytes to ${includedBytes} bytes. Use \`${section.detailTool}\` for complete details.]`;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf-8");
}

function truncateUtf8(value: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (byteLength(value) <= maxBytes) return value;
	let result = "";
	let used = 0;
	for (const character of value) {
		const bytes = byteLength(character);
		if (used + bytes > maxBytes) break;
		result += character;
		used += bytes;
	}
	return result;
}
