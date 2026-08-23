#!/usr/bin/env bash
# Snapshot this job's generated files, drop leftover merge/rebase/unmerged
# state, then (when run directly) put the files back as normal worktree copies.
#
# Sourced by push-main-with-rebase.sh: snapshot + clean only, restore after push.
# Executed before `git commit` in workflow steps so unmerged caches cannot block it.
set -euo pipefail

SNAP="${PRESERVE_SNAP_DIR:-$(mktemp -d)}"
export PRESERVE_SNAP_DIR="$SNAP"

list_leftover_files() {
  {
    git ls-files -u | awk '{print $4}'
    git diff --name-only
    git diff --name-only --cached
  } | sort -u
}

snapshot_leftover() {
  local f
  echo "Snapshotting leftover generated files:"
  while IFS= read -r f; do
    [[ -z "$f" || ! -e "$f" ]] && continue
    if grep -qE '^<<<<<<< ' "$f" 2>/dev/null; then
      echo "  skip $f (conflict markers — not a usable generated file)"
      continue
    fi
    mkdir -p "$SNAP/$(dirname "$f")"
    cp -a "$f" "$SNAP/$f"
    echo "  saved $f"
  done < <(list_leftover_files)
}

clear_vcs_state() {
  git merge --abort >/dev/null 2>&1 || true
  git rebase --abort >/dev/null 2>&1 || true
  git reset --hard HEAD
}

restore_leftover() {
  if [[ ! -d "$SNAP" ]]; then
    return 0
  fi
  if [[ -z "$(find "$SNAP" -type f -print -quit 2>/dev/null)" ]]; then
    return 0
  fi
  echo "Restoring this job's generated files onto a clean worktree."
  cp -a "$SNAP"/. .
}

# Direct invoke: make the tree committable. Sourced: caller runs the pieces.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Preserving generated worktree (snapshot → clean HEAD → restore):"
  git status --porcelain || true
  snapshot_leftover
  clear_vcs_state
  restore_leftover
  echo "Worktree is clean of unmerged state."
fi
