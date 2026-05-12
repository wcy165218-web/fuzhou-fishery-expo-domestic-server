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

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

[[ -f "$SQLITE_DB_PATH" ]] || fail "SQLite database not found: $SQLITE_DB_PATH"

DB_BACKUP_PATH="${BACKUP_DIR}/exhibition.sqlite"
FILES_BACKUP_PATH="${BACKUP_DIR}/expo-files.tar.gz"
MANIFEST_PATH="${BACKUP_DIR}/manifest.txt"

log "backup started"
log "database: $SQLITE_DB_PATH"
log "file storage: $FILE_STORAGE_ROOT"
log "backup dir: $BACKUP_DIR"

log "checkpointing WAL before backup"
sqlite3 "$SQLITE_DB_PATH" "PRAGMA wal_checkpoint(FULL);" >>"$BACKUP_DIR/backup.log" 2>&1

log "creating SQLite online backup"
sqlite3 "$SQLITE_DB_PATH" ".backup '$DB_BACKUP_PATH'" >>"$BACKUP_DIR/backup.log" 2>&1

log "verifying SQLite backup integrity"
INTEGRITY_OUTPUT="$(sqlite3 "$DB_BACKUP_PATH" "PRAGMA journal_mode=DELETE; PRAGMA integrity_check;")"
INTEGRITY_RESULT="$(printf '%s\n' "$INTEGRITY_OUTPUT" | tail -n 1)"
[[ "$INTEGRITY_RESULT" == "ok" ]] || fail "SQLite integrity check failed: $INTEGRITY_RESULT"
rm -f "$DB_BACKUP_PATH-wal" "$DB_BACKUP_PATH-shm" "$DB_BACKUP_PATH-journal"

if [[ -d "$FILE_STORAGE_ROOT" ]]; then
  log "archiving file storage"
  tar -C "$FILE_STORAGE_ROOT" -czf "$FILES_BACKUP_PATH" . >>"$BACKUP_DIR/backup.log" 2>&1
else
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
  echo "sqlite_integrity=$INTEGRITY_RESULT"
  echo "retention_days=$RETENTION_DAYS"
  wc -c "$DB_BACKUP_PATH" "$FILES_BACKUP_PATH"
} >"$MANIFEST_PATH"

log "applying retention: ${RETENTION_DAYS} days"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} + | tee -a "$LOG_FILE" "$BACKUP_DIR/backup.log"

log "backup completed"
log "manifest: $MANIFEST_PATH"
