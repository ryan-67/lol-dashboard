#!/usr/bin/env bash
# Move this job onto the current origin/main tip.
#
# refresh-oe-ml / refresh-current-ml check out the workflow-trigger SHA, then
# run after sync-current has already pushed new data/riot/games/*.json.
# Ingest recreates those files as untracked; rebase then dies with
# "untracked working tree files would be overwritten by checkout".
# Fast-forward first so those games are tracked, and Cloud Agent pushes
# during `check` / `sync-current` are included.
set -euo pipefail

git fetch origin main
git reset --hard origin/main
echo "Worktree is origin/main $(git rev-parse --short HEAD)."
