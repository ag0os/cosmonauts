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
});
