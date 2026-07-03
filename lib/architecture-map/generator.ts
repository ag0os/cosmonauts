import type {
	GenerateArchitectureMapOptions,
	GenerateArchitectureMapResult,
} from "./types.ts";

export async function generateArchitectureMap(
	_options: GenerateArchitectureMapOptions,
): Promise<GenerateArchitectureMapResult> {
	return {
		kind: "unsupported",
		reason:
			"Architecture map generation is not implemented in this foundation slice. W1 generation supports TypeScript projects in the generator task.",
	};
}
