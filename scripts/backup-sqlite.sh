#!/usr/bin/env bash

set -euo pipefail
umask 077

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/opt/expo-server/.env.production}"

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
  set +a
elif [[ -f "$PROJECT_ROOT/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env.production"
  set +a
elif [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

SQLITE_DB_PATH="${SQLITE_DB_PATH:-${DB_PATH:-/opt/expo-server/data/exhibition.sqlite}}"
FILE_STORAGE_ROOT="${FILE_STORAGE_ROOT:-${LOCAL_STORAGE_ROOT:-/var/expo-files}}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/expo-server}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RETENTION_MIN_COUNT="${RETENTION_MIN_COUNT:-3}"
BACKUP_MAX_TOTAL_MB="${BACKUP_MAX_TOTAL_MB:-0}"
BACKUP_FILE_STORAGE="${BACKUP_FILE_STORAGE:-1}"
TIMESTAMP="${BACKUP_TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/backup.log"

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" | tee -a "$LOG_FILE" "$BACKUP_DIR/backup.log"
}

fail() {
  log "ERROR: $*"
  exit 1
}

backup_count() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '
}

oldest_backup_dir() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | while IFS= read -r dir; do
    mtime="$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir" 2>/dev/null || echo 0)"
    printf '%s\t%s\n' "$mtime" "$dir"
  done | sort -n | head -n 1 | cut -f 2-
}

backup_root_size_mb() {
  du -sm "$BACKUP_ROOT" 2>/dev/null | awk '{print $1}'
}

prune_backup_dir() {
  local dir=$1
  [[ -n "$dir" && -d "$dir" ]] || return 0
  if (( $(backup_count) <= RETENTION_MIN_COUNT )); then
    log "retention minimum reached; keeping $dir"
    return 0
  fi
  log "pruning backup: $dir"
  rm -rf "$dir"
}

apply_age_retention() {
  log "applying retention: ${RETENTION_DAYS} days, minimum ${RETENTION_MIN_COUNT} backups"
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" | while IFS= read -r dir; do
    prune_backup_dir "$dir"
  done
}

apply_size_retention() {
  if (( BACKUP_MAX_TOTAL_MB <= 0 )); then
    return 0
  fi

  log "applying backup size cap: ${BACKUP_MAX_TOTAL_MB} MB, minimum ${RETENTION_MIN_COUNT} backups"
  while (( $(backup_root_size_mb) > BACKUP_MAX_TOTAL_MB )); do
    if (( $(backup_count) <= RETENTION_MIN_COUNT )); then
      log "backup root still exceeds cap, but retention minimum prevents more pruning"
      break
    fi
    prune_backup_dir "$(oldest_backup_dir)"
  done
}

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail "RETENTION_DAYS must be a non-negative integer"
[[ "$RETENTION_MIN_COUNT" =~ ^[0-9]+$ ]] || fail "RETENTION_MIN_COUNT must be a non-negative integer"
[[ "$BACKUP_MAX_TOTAL_MB" =~ ^[0-9]+$ ]] || fail "BACKUP_MAX_TOTAL_MB must be a non-negative integer"
[[ "$BACKUP_FILE_STORAGE" == "1" || "$BACKUP_FILE_STORAGE" == "0" ]] || fail "BACKUP_FILE_STORAGE must be 1 or 0"
(( RETENTION_MIN_COUNT >= 1 )) || fail "RETENTION_MIN_COUNT must be at least 1"

[[ -f "$SQLITE_DB_PATH" ]] || fail "SQLite database not found: $SQLITE_DB_PATH"

DB_BACKUP_PATH="${BACKUP_DIR}/exhibition.sqlite"
FILES_BACKUP_PATH="${BACKUP_DIR}/expo-files.tar.gz"
MANIFEST_PATH="${BACKUP_DIR}/manifest.txt"

log "backup started"
log "database: $SQLITE_DB_PATH"
log "file storage: $FILE_STORAGE_ROOT"
log "backup dir: $BACKUP_DIR"
log "backup retention: ${RETENTION_DAYS} days, minimum ${RETENTION_MIN_COUNT}, max total ${BACKUP_MAX_TOTAL_MB} MB"

log "checkpointing WAL before backup"
sqlite3 "$SQLITE_DB_PATH" "PRAGMA wal_checkpoint(FULL);" >>"$BACKUP_DIR/backup.log" 2>&1

log "creating SQLite online backup"
sqlite3 "$SQLITE_DB_PATH" ".backup '$DB_BACKUP_PATH'" >>"$BACKUP_DIR/backup.log" 2>&1

log "verifying SQLite backup integrity"
INTEGRITY_OUTPUT="$(sqlite3 "$DB_BACKUP_PATH" "PRAGMA journal_mode=DELETE; PRAGMA integrity_check;")"
INTEGRITY_RESULT="$(printf '%s\n' "$INTEGRITY_OUTPUT" | tail -n 1)"
[[ "$INTEGRITY_RESULT" == "ok" ]] || fail "SQLite integrity check failed: $INTEGRITY_RESULT"
rm -f "$DB_BACKUP_PATH-wal" "$DB_BACKUP_PATH-shm" "$DB_BACKUP_PATH-journal"

FILE_STORAGE_BACKUP_MODE="full"
if [[ "$BACKUP_FILE_STORAGE" == "0" ]]; then
  FILE_STORAGE_BACKUP_MODE="skipped"
  log "file storage archive skipped by BACKUP_FILE_STORAGE=0; creating empty compatibility archive"
  mkdir -p "$BACKUP_DIR/empty-files"
  tar -C "$BACKUP_DIR/empty-files" -czf "$FILES_BACKUP_PATH" . >>"$BACKUP_DIR/backup.log" 2>&1
  rmdir "$BACKUP_DIR/empty-files"
elif [[ -d "$FILE_STORAGE_ROOT" ]]; then
  log "archiving file storage"
  tar -C "$FILE_STORAGE_ROOT" -czf "$FILES_BACKUP_PATH" . >>"$BACKUP_DIR/backup.log" 2>&1
else
  FILE_STORAGE_BACKUP_MODE="empty"
  log "file storage directory does not exist; creating empty archive"
  mkdir -p "$BACKUP_DIR/empty-files"
  tar -C "$BACKUP_DIR/empty-files" -czf "$FILES_BACKUP_PATH" . >>"$BACKUP_DIR/backup.log" 2>&1
  rmdir "$BACKUP_DIR/empty-files"
fi

{
  echo "timestamp=$TIMESTAMP"
  echo "database_source=$SQLITE_DB_PATH"
  echo "database_backup=$DB_BACKUP_PATH"
  echo "file_storage_source=$FILE_STORAGE_ROOT"
  echo "file_storage_backup=$FILES_BACKUP_PATH"
  echo "file_storage_backup_mode=$FILE_STORAGE_BACKUP_MODE"
  echo "sqlite_integrity=$INTEGRITY_RESULT"
  echo "retention_days=$RETENTION_DAYS"
  echo "retention_min_count=$RETENTION_MIN_COUNT"
  echo "backup_max_total_mb=$BACKUP_MAX_TOTAL_MB"
  wc -c "$DB_BACKUP_PATH" "$FILES_BACKUP_PATH"
} >"$MANIFEST_PATH"

apply_age_retention
apply_size_retention

{
  echo "backup_root_size_mb_after_retention=$(backup_root_size_mb)"
  echo "backup_count_after_retention=$(backup_count)"
} >>"$MANIFEST_PATH"

log "backup completed"
log "manifest: $MANIFEST_PATH"
