#!/usr/bin/env sh
set -eu

# Install the pinned dependency graph, including ESLint, without rewriting manifests or lockfiles.
pnpm install --frozen-lockfile
