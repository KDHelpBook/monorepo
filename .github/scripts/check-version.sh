#!/usr/bin/env bash
set -euo pipefail

EXPECTED="${1#v}"
if [[ ! "$EXPECTED" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected an X.Y.Z version, got: $1" >&2
  exit 1
fi

check_value() {
  local label="$1"
  local actual="$2"
  if [[ "$actual" != "$EXPECTED" ]]; then
    echo "$label has version $actual; expected $EXPECTED" >&2
    exit 1
  fi
}

check_value "compiler/Cargo.toml" \
  "$(sed -n 's/^version = "\(.*\)"$/\1/p' compiler/Cargo.toml | head -n1)"

for PROJECT in viewer-ts registry; do
  check_value "$PROJECT/package.json" \
    "$(node -p "require('./$PROJECT/package.json').version")"
  check_value "$PROJECT/package-lock.json" \
    "$(node -p "require('./$PROJECT/package-lock.json').version")"
  check_value "$PROJECT package-lock root" \
    "$(node -p "require('./$PROJECT/package-lock.json').packages[''].version")"
done

for DOCSET in docs/*/docset.toml; do
  check_value "$DOCSET" \
    "$(sed -n 's/^version = "\(.*\)"$/\1/p' "$DOCSET" | head -n1)"
done

echo "All release sources consistently declare $EXPECTED."
