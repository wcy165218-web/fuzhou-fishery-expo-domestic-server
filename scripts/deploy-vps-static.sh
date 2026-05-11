#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_ROOT=${SCRIPT_DIR:h}
PUBLIC_DIR="$PROJECT_ROOT/public/"
CONFIG_FILE=${DEPLOY_VPS_CONFIG_FILE:-$PROJECT_ROOT/.deploy.vps.env}

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  source "$CONFIG_FILE"
  set +a
fi

VPS_HOST=${VPS_HOST:-}
VPS_PORT=${VPS_PORT:-22}
VPS_USER=${VPS_USER:-}
VPS_STATIC_PATH=${VPS_STATIC_PATH:-}
VPS_SSH_TARGET=${VPS_SSH_TARGET:-}
VPS_DEPLOY_TARGETS=${VPS_DEPLOY_TARGETS:-}
DEPLOY_ACTION=${1:-deploy}

if [[ ! -d "$PUBLIC_DIR" ]]; then
  echo "public directory not found: $PUBLIC_DIR" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required for VPS static deployment" >&2
  exit 1
fi

guard_static_root_entry() {
  local index_file="${PUBLIC_DIR}index.html"
  if [[ ! -f "$index_file" ]]; then
    echo "[deploy:vps:guard] missing public/index.html; aborting static deploy" >&2
    exit 1
  fi

  if ! grep -q 'id="login-view"' "$index_file" || ! grep -q 'id="main-view"' "$index_file"; then
    echo "[deploy:vps:guard] public/index.html is not the ERP login shell; aborting static deploy" >&2
    exit 1
  fi

  if grep -Eq 'ICP备案|备案页|public-site-shell|id="public-site"|class="public-site' "$index_file"; then
    echo "[deploy:vps:guard] public/index.html looks like the public/ICP page; aborting static deploy" >&2
    exit 1
  fi
}

if command -v rsync >/dev/null 2>&1; then
  HAS_RSYNC=1
else
  HAS_RSYNC=0
  if ! command -v tar >/dev/null 2>&1; then
    echo "rsync or tar is required for VPS static deployment" >&2
    exit 1
  fi
fi

require_config() {
  local key=$1
  local value=$2
  if [[ -z "$value" ]]; then
    echo "missing required deploy config: $key" >&2
    echo "set it in $CONFIG_FILE, or export it before running the script" >&2
    exit 1
  fi
}

target_key_for_id() {
  echo "$1" | tr '[:lower:]-' '[:upper:]_'
}

target_value() {
  local target_key=$1
  local field=$2
  local var_name="VPS_TARGET_${target_key}_${field}"
  echo "${(P)var_name:-}"
}

print_config() {
  echo "[deploy:vps] config file: ${CONFIG_FILE}"
  echo "[deploy:vps] public dir: ${PUBLIC_DIR}"
}

build_target_config() {
  local target_id=${1:-default}
  local target_key=$(target_key_for_id "$target_id")

  if [[ -n "$VPS_DEPLOY_TARGETS" ]]; then
    local target_ssh_target=$(target_value "$target_key" "SSH_TARGET")
    local target_host=$(target_value "$target_key" "HOST")
    local target_port=$(target_value "$target_key" "PORT")
    local target_user=$(target_value "$target_key" "USER")
    local target_static_path=$(target_value "$target_key" "STATIC_PATH")
    local target_ssh_key=$(target_value "$target_key" "SSH_KEY")
    local target_ssh_options=$(target_value "$target_key" "SSH_OPTIONS")
  else
    local target_ssh_target="$VPS_SSH_TARGET"
    local target_host="$VPS_HOST"
    local target_port="$VPS_PORT"
    local target_user="$VPS_USER"
    local target_static_path="$VPS_STATIC_PATH"
    local target_ssh_key=""
    local target_ssh_options=""
  fi

  if [[ -z "$target_port" ]]; then
    target_port=22
  fi

  if [[ -n "$target_ssh_key" ]]; then
    target_ssh_key=${~target_ssh_key}
  fi

  if [[ -n "$target_ssh_target" ]]; then
    require_config "VPS_TARGET_${target_key}_STATIC_PATH" "$target_static_path"
    REMOTE_TARGET="$target_ssh_target"
    VPS_STATIC_PATH="$target_static_path"
    SSH_CMD=(ssh)
    RSYNC_SSH_CMD="ssh"
  else
    require_config "VPS_TARGET_${target_key}_HOST" "$target_host"
    require_config "VPS_TARGET_${target_key}_USER" "$target_user"
    require_config "VPS_TARGET_${target_key}_STATIC_PATH" "$target_static_path"
    REMOTE_TARGET="$target_user@$target_host"
    VPS_STATIC_PATH="$target_static_path"
    SSH_CMD=(ssh -p "$target_port")
    RSYNC_SSH_CMD="ssh -p $target_port"
  fi

  if [[ -n "$target_ssh_key" ]]; then
    SSH_CMD+=(-i "$target_ssh_key")
    RSYNC_SSH_CMD="$RSYNC_SSH_CMD -i $target_ssh_key"
  fi

  if [[ -n "$target_ssh_options" ]]; then
    local ssh_option_parts=(${(z)target_ssh_options})
    SSH_CMD+=("${ssh_option_parts[@]}")
    RSYNC_SSH_CMD="$RSYNC_SSH_CMD $target_ssh_options"
  fi
}

check_connectivity_for_target() {
  local target_id=$1
  build_target_config "$target_id"
  echo "[deploy:vps] target(${target_id}): ${REMOTE_TARGET}:${VPS_STATIC_PATH}"
  echo "[deploy:vps] checking ssh connectivity for ${target_id}"
  "${SSH_CMD[@]}" "$REMOTE_TARGET" "echo connected"
  echo "[deploy:vps] checking remote static directory access for ${target_id}"
  "${SSH_CMD[@]}" "$REMOTE_TARGET" "mkdir -p '$VPS_STATIC_PATH' && test -w '$VPS_STATIC_PATH' && echo writable"
  echo "[deploy:vps] check done for ${target_id}"
}

remote_has_rsync() {
  "${SSH_CMD[@]}" "$REMOTE_TARGET" "command -v rsync >/dev/null 2>&1"
}

deploy_to_target() {
  local target_id=$1
  build_target_config "$target_id"
  echo "[deploy:vps:static] target(${target_id}): ${REMOTE_TARGET}:${VPS_STATIC_PATH}"
  echo "[deploy:vps:static] ensuring remote directory $VPS_STATIC_PATH"
  "${SSH_CMD[@]}" "$REMOTE_TARGET" "mkdir -p '$VPS_STATIC_PATH'"

  echo "[deploy:vps:static] syncing $PUBLIC_DIR -> $REMOTE_TARGET:$VPS_STATIC_PATH"
  if [[ "$HAS_RSYNC" == "1" ]] && remote_has_rsync; then
    rsync -az --delete --exclude='.DS_Store' -e "$RSYNC_SSH_CMD" "$PUBLIC_DIR" "$REMOTE_TARGET:$VPS_STATIC_PATH"
  else
    echo "[deploy:vps:static] rsync unavailable locally or remotely; using tar stream fallback"
    COPYFILE_DISABLE=1 tar --format ustar --exclude='.DS_Store' -C "$PUBLIC_DIR" -czf - . | "${SSH_CMD[@]}" "$REMOTE_TARGET" "set -e; mkdir -p '$VPS_STATIC_PATH'; find '$VPS_STATIC_PATH' -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf - -C '$VPS_STATIC_PATH'; find '$VPS_STATIC_PATH' -name '._*' -delete"
  fi

  echo "[deploy:vps:static] done for ${target_id}"
}

if [[ -n "$VPS_DEPLOY_TARGETS" ]]; then
  DEPLOY_TARGET_LIST=(${=VPS_DEPLOY_TARGETS})
else
  DEPLOY_TARGET_LIST=(default)
fi

if [[ "$DEPLOY_ACTION" == "check" ]]; then
  print_config
  for target_id in "${DEPLOY_TARGET_LIST[@]}"; do
    check_connectivity_for_target "$target_id"
  done
  exit 0
fi

if [[ "$DEPLOY_ACTION" != "deploy" ]]; then
  echo "usage: zsh ./scripts/deploy-vps-static.sh [check|deploy]" >&2
  exit 1
fi

print_config
guard_static_root_entry
for target_id in "${DEPLOY_TARGET_LIST[@]}"; do
  deploy_to_target "$target_id"
done

echo "[deploy:vps:static] done"
