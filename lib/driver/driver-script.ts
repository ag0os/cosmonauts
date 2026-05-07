export function generateBashRunner(workdir: string): string {
	void workdir;

	return `#!/usr/bin/env bash
set -uo pipefail
WORKDIR="$(cd "$(dirname "$0")" && pwd)"
trap 'rm -f "$WORKDIR/run.pid"' EXIT
exec "$WORKDIR/bin/cosmonauts-drive-step" --workdir "$WORKDIR"
`;
}
