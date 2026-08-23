#!/usr/bin/env bash
# Rebase a just-made CI commit onto origin/main and push.
# Long refresh / ML jobs race humans and Cloud Agents pushing to the same branch.
#
# Do not stash-pop. Sibling jobs and Cloud Agents also rewrite the same generated
# JSON caches; stash-pop left those files unmerged and broke the next git commit.
set -euo pipefail

RETRIES="${1:-8}"
SNAP="${PRESERVE_SNAP_DIR:-$(mktemp -d)}"
export PRESERVE_SNAP_DIR="$SNAP"

# shellcheck source=preserve-generated-worktree.sh
source "$(dirname "$0")/preserve-generated-worktree.sh"

cleanup() {
  rm -rf "$SNAP"
}
trap cleanup EXIT

echo "Preparing a clean tree for rebase (keeping a snapshot of leftover files):"
git status --porcelain || true
snapshot_leftover
clear_vcs_state

# During rebase, "theirs" is the commit being replayed (this job's artifacts).
for attempt in $(seq 1 "$RETRIES"); do
  git fetch origin main
  if git rebase origin/main -X theirs; then
    if git push origin HEAD:main; then
      echo "Pushed main on attempt ${attempt}."
      restore_leftover
      exit 0
    fi
    echo "Push rejected on attempt ${attempt}/${RETRIES} — concurrent main update."
  else
    echo "Rebase failed on attempt ${attempt}/${RETRIES}."
    git rebase --abort || true
  fi
  sleep $((attempt * 4))
done

echo "::error::Could not rebase/push onto origin/main after ${RETRIES} attempts."
restore_leftover
exit 1
