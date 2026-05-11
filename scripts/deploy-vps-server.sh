#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_ROOT=${SCRIPT_DIR:h}
CONFIG_FILE=${DEPLOY_VPS_CONFIG_FILE:-$PROJECT_ROOT/.deploy.vps.env}
DEPLOY_ACTION=${1:-deploy}

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  source "$CONFIG_FILE"
  set +a
fi

VPS_HOST=${VPS_HOST:-}
VPS_PORT=${VPS_PORT:-22}
VPS_USER=${VPS_USER:-}
VPS_SSH_TARGET=${VPS_SSH_TARGET:-}
VPS_DEPLOY_TARGETS=${VPS_DEPLOY_TARGETS:-}
VPS_SERVER_PATH=${VPS_SERVER_PATH:-/opt/expo-server}
VPS_FILE_STORAGE_ROOT=${VPS_FILE_STORAGE_ROOT:-/var/expo-files}
VPS_BACKUP_PATH=${VPS_BACKUP_PATH:-/var/backups/expo-server}
VPS_STATIC_PATH=${VPS_STATIC_PATH:-/var/www/expo-static}
VPS_PM2_APP_NAME=${VPS_PM2_APP_NAME:-expo-server}
VPS_REMOTE_ENV_FILE=${VPS_REMOTE_ENV_FILE:-$VPS_SERVER_PATH/.env.production}
VPS_INSTALL_PM2=${VPS_INSTALL_PM2:-1}
VPS_PM2_SAVE=${VPS_PM2_SAVE:-1}

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required for VPS server deployment" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for VPS server deployment" >&2
  exit 1
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

remote_quote() {
  printf "%q" "$1"
}

print_config() {
  echo "[deploy:vps:server] config file: ${CONFIG_FILE}"
  echo "[deploy:vps:server] project root: ${PROJECT_ROOT}"
}

build_target_config() {
  local target_id=${1:-default}
  local target_key=$(target_key_for_id "$target_id")

  if [[ -n "$VPS_DEPLOY_TARGETS" ]]; then
    local target_ssh_target=$(target_value "$target_key" "SSH_TARGET")
    local target_host=$(target_value "$target_key" "HOST")
    local target_port=$(target_value "$target_key" "PORT")
    local target_user=$(target_value "$target_key" "USER")
    local target_ssh_key=$(target_value "$target_key" "SSH_KEY")
    local target_ssh_options=$(target_value "$target_key" "SSH_OPTIONS")
    local target_server_path=$(target_value "$target_key" "SERVER_PATH")
    local target_file_root=$(target_value "$target_key" "FILE_STORAGE_ROOT")
    local target_backup_path=$(target_value "$target_key" "BACKUP_PATH")
    local target_static_path=$(target_value "$target_key" "STATIC_PATH")
    local target_env_file=$(target_value "$target_key" "REMOTE_ENV_FILE")
    local target_pm2_app_name=$(target_value "$target_key" "PM2_APP_NAME")
  else
    local target_ssh_target="$VPS_SSH_TARGET"
    local target_host="$VPS_HOST"
    local target_port="$VPS_PORT"
    local target_user="$VPS_USER"
    local target_ssh_key=""
    local target_ssh_options=""
    local target_server_path="$VPS_SERVER_PATH"
    local target_file_root="$VPS_FILE_STORAGE_ROOT"
    local target_backup_path="$VPS_BACKUP_PATH"
    local target_static_path="$VPS_STATIC_PATH"
    local target_env_file="$VPS_REMOTE_ENV_FILE"
    local target_pm2_app_name="$VPS_PM2_APP_NAME"
  fi

  if [[ -z "$target_port" ]]; then target_port=22; fi
  if [[ -z "$target_server_path" ]]; then target_server_path=/opt/expo-server; fi
  if [[ -z "$target_file_root" ]]; then target_file_root=/var/expo-files; fi
  if [[ -z "$target_backup_path" ]]; then target_backup_path=/var/backups/expo-server; fi
  if [[ -z "$target_static_path" ]]; then target_static_path=/var/www/expo-static; fi
  if [[ -z "$target_env_file" ]]; then target_env_file="${target_server_path}/.env.production"; fi
  if [[ -z "$target_pm2_app_name" ]]; then target_pm2_app_name=expo-server; fi

  if [[ -n "$target_ssh_key" ]]; then
    target_ssh_key=${~target_ssh_key}
  fi

  if [[ -n "$target_ssh_target" ]]; then
    REMOTE_TARGET="$target_ssh_target"
    SSH_CMD=(ssh)
    RSYNC_SSH_CMD="ssh"
  else
    require_config "VPS_TARGET_${target_key}_HOST" "$target_host"
    require_config "VPS_TARGET_${target_key}_USER" "$target_user"
    REMOTE_TARGET="$target_user@$target_host"
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

  REMOTE_SERVER_PATH="$target_server_path"
  REMOTE_FILE_STORAGE_ROOT="$target_file_root"
  REMOTE_BACKUP_PATH="$target_backup_path"
  REMOTE_STATIC_PATH="$target_static_path"
  REMOTE_ENV_FILE="$target_env_file"
  REMOTE_PM2_APP_NAME="$target_pm2_app_name"
}

remote_bootstrap_command() {
  local server_path=$(remote_quote "$REMOTE_SERVER_PATH")
  local file_root=$(remote_quote "$REMOTE_FILE_STORAGE_ROOT")
  local backup_path=$(remote_quote "$REMOTE_BACKUP_PATH")
  local static_path=$(remote_quote "$REMOTE_STATIC_PATH")
  local env_file=$(remote_quote "$REMOTE_ENV_FILE")

  cat <<REMOTE
set -euo pipefail
mkdir -p ${server_path} ${file_root} ${backup_path} ${static_path} ${server_path}/data
touch ${env_file}
chmod 600 ${env_file}
REMOTE
}

remote_release_command() {
  local server_path=$(remote_quote "$REMOTE_SERVER_PATH")
  local app_name=$(remote_quote "$REMOTE_PM2_APP_NAME")
  local install_pm2=$(remote_quote "$VPS_INSTALL_PM2")
  local pm2_save=$(remote_quote "$VPS_PM2_SAVE")

  cat <<REMOTE
set -euo pipefail
cd ${server_path}
npm ci --omit=dev
chmod +x scripts/backup-sqlite.sh scripts/configure-vps-domains.sh scripts/deploy-vps-server.sh scripts/deploy-vps-static.sh
if ! command -v pm2 >/dev/null 2>&1; then
  if [[ ${install_pm2} == 1 ]]; then
    npm install -g pm2
  else
    echo "pm2 is not installed; install it or set VPS_INSTALL_PM2=1" >&2
    exit 1
  fi
fi
PM2_APP_NAME=${app_name} pm2 startOrReload ecosystem.config.cjs --only ${app_name} --update-env
pm2 status ${app_name}
if [[ ${pm2_save} == 1 ]]; then
  pm2 save
fi
REMOTE
}

check_target() {
  local target_id=$1
  build_target_config "$target_id"
  echo "[deploy:vps:server] target(${target_id}): ${REMOTE_TARGET}:${REMOTE_SERVER_PATH}"
  "${SSH_CMD[@]}" "$REMOTE_TARGET" "echo connected && command -v node && command -v npm"
  echo "[deploy:vps:server] check done for ${target_id}"
}

deploy_target() {
  local target_id=$1
  build_target_config "$target_id"
  echo "[deploy:vps:server] target(${target_id}): ${REMOTE_TARGET}:${REMOTE_SERVER_PATH}"
  echo "[deploy:vps:server] ensuring remote runtime directories"
  remote_bootstrap_command | "${SSH_CMD[@]}" "$REMOTE_TARGET" "bash -s"

  echo "[deploy:vps:server] syncing server files"
  rsync -az --delete \
    --exclude='.DS_Store' \
    --exclude='.git/' \
    --exclude='.wrangler/' \
    --exclude='.wrangler-home/' \
    --exclude='node_modules/' \
    --exclude='backups/' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='.deploy.vps.env' \
    --exclude='db/local/*.sqlite' \
    --exclude='db/local/*.sqlite-*' \
    -e "$RSYNC_SSH_CMD" \
    "$PROJECT_ROOT/" "$REMOTE_TARGET:$REMOTE_SERVER_PATH/"

  echo "[deploy:vps:server] installing dependencies and reloading PM2"
  remote_release_command | "${SSH_CMD[@]}" "$REMOTE_TARGET" "bash -s"
  echo "[deploy:vps:server] done for ${target_id}"
}

if [[ -n "$VPS_DEPLOY_TARGETS" ]]; then
  DEPLOY_TARGET_LIST=(${=VPS_DEPLOY_TARGETS})
else
  DEPLOY_TARGET_LIST=(default)
fi

if [[ "$DEPLOY_ACTION" == "check" ]]; then
  print_config
  for target_id in "${DEPLOY_TARGET_LIST[@]}"; do
    check_target "$target_id"
  done
  exit 0
fi

if [[ "$DEPLOY_ACTION" != "deploy" ]]; then
  echo "usage: zsh ./scripts/deploy-vps-server.sh [check|deploy]" >&2
  exit 1
fi

print_config
for target_id in "${DEPLOY_TARGET_LIST[@]}"; do
  deploy_target "$target_id"
done

echo "[deploy:vps:server] done"
