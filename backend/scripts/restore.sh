#!/usr/bin/env bash
# ==============================================================================
# Ustaad Marketplace — Automated PostgreSQL 16 Restore Script
# ==============================================================================
# Usage:
#   ./scripts/restore.sh <path_to_backup_file.sql.gz>
#
# Environment variables:
#   DATABASE_URL     - e.g. postgresql://user:pass@localhost:5432/ustaad
#   FORCE_RESTORE    - Set to "true" to skip interactive confirmation
# ==============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file '${BACKUP_FILE}' does not exist."
  exit 1
fi

if [ "${FORCE_RESTORE:-false}" != "true" ]; then
  echo "WARNING: This will overwrite data in your target database with '${BACKUP_FILE}'."
  read -r -p "Are you sure you want to proceed? (yes/no): " CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled by user."
    exit 0
  fi
fi

echo "[Ustaad Restore] Starting database restore at $(date)..."

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[Ustaad Restore] Restoring using DATABASE_URL..."
  gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"
else
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-postgres}"
  PGDATABASE="${PGDATABASE:-ustaad}"

  echo "[Ustaad Restore] Restoring to database '${PGDATABASE}' on ${PGHOST}:${PGPORT}..."
  gunzip -c "${BACKUP_FILE}" | psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}"
fi

echo "[Ustaad Restore] Database restored successfully from ${BACKUP_FILE} at $(date)."

