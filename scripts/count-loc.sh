#!/usr/bin/env bash
# count-loc.sh — Count lines of code in the knownissue monorepo
# Uses git ls-files to respect .gitignore, groups by package and language.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RESET='\033[0m'

# Count non-blank lines from a list of files on stdin
count_loc() {
  xargs cat 2>/dev/null | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' '
}

# Count all lines from a list of files on stdin
count_all() {
  xargs cat 2>/dev/null | wc -l | tr -d ' '
}

# Count files from stdin
count_files() {
  wc -l | tr -d ' '
}

# Print a row: label, code lines, file count
row() {
  printf "  %-28s %8d loc  %5d files\n" "$1" "$2" "$3"
}

separator() {
  printf "  %s\n" "──────────────────────────────────────────────────"
}

# Cache all tracked files once (exclude generated code)
ALL_FILES=$(git ls-files --cached --others --exclude-standard | grep -v 'src/generated/')

echo ""
echo -e "${BOLD}knownissue — Lines of Code${RESET}"
echo -e "${DIM}(non-blank lines, respecting .gitignore)${RESET}"
echo ""

# ── By package ──────────────────────────────────────────
echo -e "${CYAN}${BOLD}By Package${RESET}"
echo ""

for pkg in apps/api apps/web packages/db packages/shared packages/tsconfig; do
  pkg_files=$(echo "$ALL_FILES" | grep -E "^${pkg}/" | grep -Ev '\.(json|lock|svg|png|jpg|ico|woff2?)$' || true)
  if [ -n "$pkg_files" ]; then
    nfiles=$(echo "$pkg_files" | count_files)
    loc=$(echo "$pkg_files" | count_loc)
    row "$pkg" "$loc" "$nfiles"
  else
    row "$pkg" 0 0
  fi
done

separator

# Root config files
root_files=$(echo "$ALL_FILES" | grep -Ev '^(apps|packages)/' | grep -Ev '\.(json|lock|svg|png|jpg|ico|woff2?)$' || true)
if [ -n "$root_files" ]; then
  nfiles=$(echo "$root_files" | count_files)
  loc=$(echo "$root_files" | count_loc)
  row "root (config, scripts, etc)" "$loc" "$nfiles"
else
  row "root (config, scripts, etc)" 0 0
fi

echo ""

# ── By language ─────────────────────────────────────────
echo -e "${GREEN}${BOLD}By Language${RESET}"
echo ""

print_lang() {
  local label="$1" ext="$2"
  local files loc nfiles
  files=$(echo "$ALL_FILES" | grep -E "\.(${ext})$" || true)
  if [ -n "$files" ]; then
    nfiles=$(echo "$files" | count_files)
    loc=$(echo "$files" | count_loc)
    row "$label" "$loc" "$nfiles"
  fi
}

print_lang "TypeScript (ts/tsx)" "tsx?"
print_lang "CSS"                 "css"
print_lang "SQL / Prisma"        "sql|prisma"
print_lang "HTML"                "html"
print_lang "Shell"               "sh|bash"
print_lang "Markdown"            "md|mdx"

separator

print_lang "JSON (config)"       "json"

echo ""

# ── Totals ──────────────────────────────────────────────
echo -e "${YELLOW}${BOLD}Totals${RESET}"
echo ""

all_code=$(echo "$ALL_FILES" | grep -Ev '\.(svg|png|jpg|ico|woff2?|lock)$' || true)
nfiles=$(echo "$all_code" | count_files)
total_lines=$(echo "$all_code" | count_all)
total_loc=$(echo "$all_code" | count_loc)
blank=$((total_lines - total_loc))

printf "  %-28s %8d\n" "Files" "$nfiles"
printf "  %-28s %8d\n" "Total lines" "$total_lines"
printf "  %-28s %8d\n" "Non-blank lines" "$total_loc"
printf "  %-28s %8d\n" "Blank lines" "$blank"

echo ""
