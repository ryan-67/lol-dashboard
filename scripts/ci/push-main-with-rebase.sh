#!/usr/bin/env bash
# Rebase a just-made CI commit onto origin/main and push.
# Long refresh / ML jobs race humans and Cloud Agents pushing to the same branch.
#
# Mid-job callers (OE CDN publish) leave Riot/ingest files dirty on purpose.
# Stash tracked leftover, rebase/push, then pop so later steps still have those files.
set -euo pipefail

RETRIES="${1:-8}"
STASHED=0

restore_stash() {
  if [[ "$STASHED" -eq 1 ]]; then
    echo "Restoring leftover worktree after rebase/push."
    git stash pop || echo "::warning::stash pop failed; later job steps may see a cleaner tree."
    STASHED=0
  fi
}
trap restore_stash EXIT

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Stashing leftover tracked changes so rebase can run:"
  git status --porcelain
  git stash push -m "ci: leftover after commit $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  STASHED=1
fi

# During rebase, "theirs" is the commit being replayed (this job's artifacts).
# Prefer those over a Cloud Agent touching the same JSON in the same window.
for attempt in $(seq 1 "$RETRIES"); do
  git fetch origin main
  if git rebase origin/main -X theirs; then
    if git push origin HEAD:main; then
      echo "Pushed main on attempt ${attempt}."
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
exit 1
