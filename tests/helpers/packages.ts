import type {
	InstallMeta,
	InstallResult,
} from "../../lib/packages/installer.ts";
import type { InstalledPackage } from "../../lib/packages/types.ts";

export function createInstalledPackageFixture(
	name: string,
	scope: "user" | "project" = "user",
): InstalledPackage {
	return {
		manifest: {
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: [{ name: "coding", path: "domains/coding" }],
		},
		installPath: `/store/${name}`,
		scope,
		installedAt: new Date(),
	};
}

export function createInstallResultFixture(
	overrides: Partial<InstallResult> = {},
): InstallResult {
	return {
		manifest: overrides.manifest ?? {
			name: "new-pkg",
			version: "1.0.0",
			description: "Test",
			domains: [{ name: "coding", path: "domains/coding" }],
		},
		installedTo: overrides.installedTo ?? "/store/new-pkg",
		domainMergeResults: overrides.domainMergeResults ?? [],
	};
}

export function createInstallMetaFixture(
	source: string,
	extra: Record<string, unknown> = {},
): InstallMeta {
	return {
		source,
		installedAt: "2024-01-01T00:00:00.000Z",
		...extra,
	} as InstallMeta;
}
