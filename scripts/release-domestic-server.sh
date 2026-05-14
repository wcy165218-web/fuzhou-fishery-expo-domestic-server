#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_ROOT=${SCRIPT_DIR:h}
cd "$PROJECT_ROOT"

ACTION=${1:-check}
RELEASE_BRANCH=${RELEASE_BRANCH:-domestic-server-main}
REMOTE_NAME=${REMOTE_NAME:-github-domestic}
REMOTE_BRANCH=${REMOTE_BRANCH:-main}

print_usage() {
  cat <<USAGE
usage: zsh ./scripts/release-domestic-server.sh [check|deploy|verify]

Environment overrides:
  RELEASE_BRANCH=domestic-server-main
  REMOTE_NAME=github-domestic
  REMOTE_BRANCH=main
USAGE
}

fail() {
  echo "[release:domestic] ERROR: $*" >&2
  exit 1
}

require_clean_worktree() {
  local status
  status=$(git status --porcelain)
  [[ -z "$status" ]] || fail "working tree is not clean; commit or stash changes first"
}

require_release_branch() {
  local current_branch
  current_branch=$(git branch --show-current)
  [[ "$current_branch" == "$RELEASE_BRANCH" ]] || fail "switch to $RELEASE_BRANCH first; current branch is $current_branch"
}

fetch_release_remote() {
  echo "[release:domestic] fetching $REMOTE_NAME/$REMOTE_BRANCH"
  git fetch "$REMOTE_NAME" "$REMOTE_BRANCH"
}

require_local_not_behind_remote() {
  local local_head remote_head merge_base
  local_head=$(git rev-parse HEAD)
  remote_head=$(git rev-parse "$REMOTE_NAME/$REMOTE_BRANCH")
  merge_base=$(git merge-base HEAD "$REMOTE_NAME/$REMOTE_BRANCH")

  if [[ "$local_head" == "$remote_head" ]]; then
    echo "[release:domestic] local branch matches $REMOTE_NAME/$REMOTE_BRANCH: $local_head"
    return
  fi

  if [[ "$merge_base" == "$remote_head" ]]; then
    echo "[release:domestic] local branch is ahead of $REMOTE_NAME/$REMOTE_BRANCH"
    return
  fi

  fail "local branch is behind or diverged from $REMOTE_NAME/$REMOTE_BRANCH; pull/merge intentionally before release"
}

run_checks() {
  require_release_branch
  require_clean_worktree
  fetch_release_remote
  require_local_not_behind_remote

  echo "[release:domestic] running npm run check"
  npm run check

  echo "[release:domestic] running npm test"
  npm test
}

deploy_release() {
  run_checks

  local revision
  revision=$(git rev-parse HEAD)

  echo "[release:domestic] pushing $revision to $REMOTE_NAME/$REMOTE_BRANCH"
  git push "$REMOTE_NAME" "HEAD:$REMOTE_BRANCH"

  echo "[release:domestic] checking VPS deploy targets"
  npm run deploy:vps:check

  echo "[release:domestic] deploying static assets"
  npm run deploy:vps:static

  echo "[release:domestic] deploying server code"
  LOCAL_GIT_REVISION="$revision" LOCAL_GIT_BRANCH="$RELEASE_BRANCH" npm run deploy:vps:server

  echo "[release:domestic] release deployed: $revision"
  echo "[release:domestic] verify with: zsh ./scripts/release-domestic-server.sh verify"
}

verify_release() {
  require_release_branch
  require_clean_worktree
  fetch_release_remote
  require_local_not_behind_remote

  echo "[release:domestic] local revision:  $(git rev-parse HEAD)"
  echo "[release:domestic] remote revision: $(git rev-parse "$REMOTE_NAME/$REMOTE_BRANCH")"
  echo "[release:domestic] server revision:"
  npm run deploy:vps:server:revision
}

case "$ACTION" in
  check)
    run_checks
    ;;
  deploy)
    deploy_release
    ;;
  verify)
    verify_release
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    print_usage >&2
    exit 1
    ;;
esac
