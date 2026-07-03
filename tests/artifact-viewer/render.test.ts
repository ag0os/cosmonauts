import { describe, expect, test } from "vitest";
import { renderArtifactMarkdown } from "../../lib/artifact-viewer/index.ts";

describe("artifact-viewer render", () => {
	test("escapes markdown before rendering viewer pages @cosmo-behavior plan:code-structure-map#B-016", () => {
		const html = renderArtifactMarkdown(
			[
				"# <script>title()</script>",
				"",
				"- item <img src=x onerror=alert(1)>",
				"",
				"```html",
				"<script>code()</script>",
				"```",
			].join("\n"),
		);

		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;script&gt;title()&lt;/script&gt;");
		expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(html).toContain("&lt;script&gt;code()&lt;/script&gt;");
	});

	test("renders inline links in the supported subset with escaped href and label @cosmo-behavior plan:code-structure-map#B-016", () => {
		const html = renderArtifactMarkdown(
			"See [the docs](https://example.test/a?b=c) for details.",
		);

		expect(html).toContain('<a href="https://example.test/a?b=c">the docs</a>');
	});

	test("does not render unsafe link schemes as active anchors", () => {
		const html = renderArtifactMarkdown("Click [here](javascript:evil) now.");

		expect(html).not.toContain("<a ");
		expect(html).not.toContain('href="javascript');
		expect(html).toContain("[here](javascript:evil)");
	});
});
