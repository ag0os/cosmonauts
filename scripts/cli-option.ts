/** Return the value following a single CLI option. */
export function cliOption(
	args: readonly string[],
	name: string,
): string | undefined {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
}
