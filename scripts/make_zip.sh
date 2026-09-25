#!/usr/bin/env bash
# Builds the submission zip. Excludes dependencies, build output, git internals and — above all —
# any .env file: the OpenRouter key must never leave this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:-travel-risk}"
out="${2:-$HOME/Downloads}/$name.zip"
rm -f "$out"
zip -rq "$out" . \
  -x 'node_modules/*' '.next/*' '.git/*' '.gstack/*' '.claude/*' '*.DS_Store' 'next-env.d.ts' '*.tsbuildinfo' \
  -x '.env' '.env.local' '.env.*.local' '.env.production' '.env.development'
# Belt and braces: refuse to ship anything that looks like a key.
if unzip -l "$out" | grep -E '\.env($|\.local)' ; then echo "REFUSED: an env file slipped in" >&2; rm -f "$out"; exit 1; fi
if unzip -p "$out" 2>/dev/null | grep -aE 'sk-[A-Za-z0-9_-]{20,}' >/dev/null; then echo "REFUSED: something looks like an API key" >&2; rm -f "$out"; exit 1; fi
echo "$out ($(du -h "$out" | cut -f1)) — $(unzip -l "$out" | tail -1 | awk '{print $2}') files"
