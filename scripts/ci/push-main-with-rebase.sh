#!/usr/bin/env bash
# Rebase a just-made CI commit onto origin/main and push.
# Long refresh / ML jobs race humans and Cloud Agents pushing to the same branch.
set -euo pipefail

RETRIES="${1:-8}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Stashing leftover worktree dirt so rebase can run."
  git stash push --include-untracked \
    -m "ci: leftover after commit $(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
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
