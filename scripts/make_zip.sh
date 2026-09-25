#!/usr/bin/env bash
# Builds the submission zip from the files git tracks, and nothing else: no dependencies, no build
# output, no local tool folders, and above all no .env file. The OpenRouter key never leaves this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:-travel-risk}"
out="${2:-$HOME/Downloads}/$name.zip"
if ! git diff --quiet || ! git diff --cached --quiet; then echo "REFUSED: commit your changes first, the zip is built from git" >&2; exit 1; fi
rm -f "$out"
git ls-files | zip -q "$out" -@
# Belt and braces: refuse to ship anything that looks like a key.
if unzip -l "$out" | grep -E '\.env($|\.local)' ; then echo "REFUSED: an env file slipped in" >&2; rm -f "$out"; exit 1; fi
if unzip -p "$out" 2>/dev/null | grep -aE 'sk-[A-Za-z0-9_-]{20,}' >/dev/null; then echo "REFUSED: something looks like an API key" >&2; rm -f "$out"; exit 1; fi
echo "$out ($(du -h "$out" | cut -f1)) — $(unzip -l "$out" | tail -1 | awk '{print $2}') files"
