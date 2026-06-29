import {
	writeProjectInstalledSyntheticDomainPackage,
	writeSyntheticInstallableDomainPackage,
} from "./packages.ts";

type SyntheticDomainPackageOptions = Parameters<
	typeof writeSyntheticInstallableDomainPackage
>[1];

type SyntheticDomainPackageFixture = Awaited<
	ReturnType<typeof writeSyntheticInstallableDomainPackage>
>;

export async function writeSyntheticDomainPackage(
	packageRoot: string,
	options: SyntheticDomainPackageOptions = {},
): Promise<SyntheticDomainPackageFixture> {
	return writeSyntheticInstallableDomainPackage(packageRoot, options);
}

export async function writeProjectInstalledDomainPackage(
	projectRoot: string,
	options: SyntheticDomainPackageOptions = {},
): Promise<SyntheticDomainPackageFixture> {
	return writeProjectInstalledSyntheticDomainPackage(projectRoot, options);
}
