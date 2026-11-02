#!/usr/bin/env bash
# ==============================================================================
# Ustaad Marketplace — Automated PostgreSQL 16 Backup Script
# ==============================================================================
# Usage:
#   ./scripts/backup.sh
#
# Environment variables:
#   DATABASE_URL     - e.g. postgresql://user:pass@localhost:5432/ustaad
#   BACKUP_DIR       - Directory to store dumps (default: ./backups)
#   RETENTION_DAYS   - Days to keep backup files (default: 14)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="ustaad_db_${TIMESTAMP}.sql.gz"
TARGET_FILE="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[Ustaad Backup] Starting database backup at $(date)..."

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[Ustaad Backup] Backing up using DATABASE_URL..."
  pg_dump "${DATABASE_URL}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    | gzip -9 > "${TARGET_FILE}"
else
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-postgres}"
  PGDATABASE="${PGDATABASE:-ustaad}"

  echo "[Ustaad Backup] Backing up database '${PGDATABASE}' on ${PGHOST}:${PGPORT}..."
  pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    | gzip -9 > "${TARGET_FILE}"
fi

FILE_SIZE=$(du -h "${TARGET_FILE}" | cut -f1)
echo "[Ustaad Backup] Backup completed successfully: ${TARGET_FILE} (${FILE_SIZE})"

# Prune old backups older than RETENTION_DAYS
echo "[Ustaad Backup] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "ustaad_db_*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
echo "[Ustaad Backup] Done."
