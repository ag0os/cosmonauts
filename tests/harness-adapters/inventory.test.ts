import { describe, expect, test } from "vitest";
import { prepareSkillExportAssets } from "../../lib/harness-adapters/inventory.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";

describe("skill export asset preparation", () => {
	test("lists each colliding asset once even when it is supplied twice", () => {
		const first = injectedSkill("skill:first", "shared");
		const second = injectedSkill("skill:second", "shared");
		const prepared = prepareSkillExportAssets({
			candidates: [],
			sourceHealth: [],
			injectedAssets: [first, first, second],
		});
		expect(prepared.collisions).toEqual([
			{
				outputIdentity: "shared",
				claims: [
					{ assetId: "skill:first", logicalPath: "first" },
					{ assetId: "skill:second", logicalPath: "second" },
				],
			},
		]);
		expect(prepared.reconciliationAuthority).toBe("blocked-collision");
	});
});

function injectedSkill(assetId: string, outputIdentity: string): HarnessAsset {
	const logicalPath = assetId.replace("skill:", "");
	return {
		assetId,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: "consumer:assets",
		sourceRoot: "/consumer/assets",
		sourcePath: logicalPath,
		logicalPath,
		outputIdentity,
		defaultScope: "project",
	};
}
