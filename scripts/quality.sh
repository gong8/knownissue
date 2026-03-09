#!/usr/bin/env bash
# quality.sh — Code quality gate for CI and local development.
# Scans source files for banned patterns. Exit 1 if any are found.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[31m'
YELLOW='\033[33m'
GREEN='\033[32m'
RESET='\033[0m'

errors=0
warnings=0

# Get tracked source files (respect .gitignore, skip generated code)
SOURCE_FILES=$(git ls-files --cached --others --exclude-standard \
  | grep -E '\.(ts|tsx)$' \
  | grep -v 'src/generated/' \
  | grep -v 'node_modules/' \
  | grep -v 'sst-env\.d\.ts' \
  || true)

if [ -z "$SOURCE_FILES" ]; then
  echo -e "${YELLOW}No source files found${RESET}"
  exit 0
fi

# ── Helpers ────────────────────────────────────────────

check_pattern() {
  local label="$1"
  local pattern="$2"
  local severity="$3"  # "error" or "warn"
  local files_filter="${4:-}"  # optional grep -v filter

  local target_files="$SOURCE_FILES"
  if [ -n "$files_filter" ]; then
    target_files=$(echo "$target_files" | grep -v "$files_filter" || true)
  fi

  if [ -z "$target_files" ]; then
    return
  fi

  local matches
  matches=$(echo "$target_files" | xargs grep -n -E "$pattern" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    local count
    count=$(echo "$matches" | wc -l | tr -d ' ')

    if [ "$severity" = "error" ]; then
      echo -e "  ${RED}FAIL${RESET}  ${label} ${DIM}(${count} occurrence$([ "$count" -ne 1 ] && echo "s"))${RESET}"
      echo "$matches" | head -10 | while IFS= read -r line; do
        echo -e "        ${DIM}${line}${RESET}"
      done
      if [ "$count" -gt 10 ]; then
        echo -e "        ${DIM}... and $((count - 10)) more${RESET}"
      fi
      errors=$((errors + count))
    else
      echo -e "  ${YELLOW}WARN${RESET}  ${label} ${DIM}(${count} occurrence$([ "$count" -ne 1 ] && echo "s"))${RESET}"
      echo "$matches" | head -5 | while IFS= read -r line; do
        echo -e "        ${DIM}${line}${RESET}"
      done
      if [ "$count" -gt 5 ]; then
        echo -e "        ${DIM}... and $((count - 5)) more${RESET}"
      fi
      warnings=$((warnings + count))
    fi
  else
    echo -e "  ${GREEN}PASS${RESET}  ${label}"
  fi
}

# ── Run checks ─────────────────────────────────────────

echo ""
echo -e "${BOLD}Quality Gate${RESET}"
echo ""

# Hard failures — these block CI
echo -e "${BOLD}Banned patterns${RESET}"
check_pattern "@ts-ignore"              "//\s*@ts-ignore"           error
check_pattern "@ts-expect-error"        "//\s*@ts-expect-error"     error
check_pattern "@ts-nocheck"             "//\s*@ts-nocheck"          error
check_pattern "eslint-disable"          "eslint-disable([^-]|$)"    error
check_pattern "as any"                  "\bas any\b"                error
check_pattern ": any"                   ":\s*any\b"                 error
check_pattern "debugger"                "^\s*debugger\s*;?\s*$"     error
check_pattern "console.log (source)"    "console\.log\("            error "seed\.ts\|data-migration\.ts"

echo ""

# Warnings — visible but don't fail
echo -e "${BOLD}Tech debt markers${RESET}"
check_pattern "TODO"                    "//\s*(TODO|@todo)\b"       warn
check_pattern "FIXME"                   "//\s*FIXME\b"              warn
check_pattern "HACK"                    "//\s*(HACK|XXX)\b"         warn

echo ""

# ── Summary ────────────────────────────────────────────

if [ "$errors" -gt 0 ]; then
  echo -e "${RED}${BOLD}FAILED${RESET} — ${errors} error$([ "$errors" -ne 1 ] && echo "s") found"
  [ "$warnings" -gt 0 ] && echo -e "${DIM}(plus ${warnings} warning$([ "$warnings" -ne 1 ] && echo "s"))${RESET}"
  echo ""
  exit 1
else
  echo -e "${GREEN}${BOLD}PASSED${RESET}"
  [ "$warnings" -gt 0 ] && echo -e "${DIM}(${warnings} warning$([ "$warnings" -ne 1 ] && echo "s"))${RESET}"
  echo ""
  exit 0
fi
