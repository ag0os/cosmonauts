#!/bin/bash
# Usage: .spike/run.sh <label> <mutate-ranges> <tests-list-file> [extra stryker args...]
# Runs vitest baseline on the test list, then scoped Stryker. Logs to .spike/<label>.*
set -u
cd "$(dirname "$0")/.."
label=$1; mutate=$2; list=$3; shift 3
rm -rf .stryker-tmp
if [[ $mutate == @* ]]; then mutate=$(cat "${mutate#@}"); fi
tests_csv=$(grep '\.test\.ts$' "$list" | paste -sd, -)
echo "== vitest baseline ($label)"
start=$(date +%s.%N)
npx vitest run $(grep '\.test\.ts$' "$list" | tr '\n' ' ') > ".spike/$label.vitest.log" 2>&1
echo "vitest exit=$? wall=$(echo "$(date +%s.%N) - $start" | bc)"
grep -E "Test Files|Tests  " ".spike/$label.vitest.log"
grep -E "FAIL" ".spike/$label.vitest.log" | head -10
echo "== stryker ($label)"
start=$(date +%s.%N)
STRYKER_VITEST_POOL=${STRYKER_VITEST_POOL:-forks} npx stryker run .spike/stryker.config.mjs --mutate "$mutate" --testFiles "$tests_csv" "$@" > ".spike/$label.stryker.log" 2>&1
echo "stryker exit=$? wall=$(echo "$(date +%s.%N) - $start" | bc)"
grep -E "Instrumented|Initial test run|Done in|ERROR" ".spike/$label.stryker.log" | sed 's/\x1b\[[0-9;]*m//g' | head -10
cp .spike/reports/mutation.json ".spike/reports/$label.json" 2>/dev/null
node .spike/summ.mjs ".spike/reports/$label.json" | tail -1
