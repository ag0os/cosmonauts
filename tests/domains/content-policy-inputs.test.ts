import { expect, test } from "vitest";
import { manifest as main } from "../../domains/main/domain.ts";
import { manifest as shared } from "../../domains/shared/domain.ts";

test("the current consumer declares its fallback, activation and default policy explicitly", () => {
	expect(main.default).toBe(true);
	expect(shared.alwaysActive).toBe(true);
	expect(shared.resourceFallback).toBe(true);
});
