#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
theme_root=${NOCTURNE_ROSE_ROOT:-"$repo_root/../../nocturne-rose/nocturne-rose_main"}
source_dir="$theme_root/dist/sisyphus"
destination="$repo_root/frontend/vendor/nocturne-rose"
mode=${1:-sync}

if [ ! -d "$source_dir" ]; then
  if [ "$mode" = "--check" ]; then
    printf '%s\n' "Nocturne Rose sibling checkout not present; skipping cross-repository snapshot check."
    exit 0
  fi
  printf '%s\n' "Nocturne Rose repository not found at $theme_root" >&2
  exit 1
fi

if [ "$mode" = "--check" ]; then
  diff -ru "$source_dir" "$destination"
  exit
fi

rm -rf "$destination"
mkdir -p "$destination"
cp -R "$source_dir"/. "$destination"/
npm --prefix "$repo_root/frontend" install --package-lock-only --ignore-scripts
