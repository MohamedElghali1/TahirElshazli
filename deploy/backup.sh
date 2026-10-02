#!/usr/bin/env bash
#
# Nightly / pre-deploy PostgreSQL backup for the Hostinger VPS
# (docs/HOSTINGER_DEPLOYMENT.md §9, REM-023).
#
# Usage: backup.sh nightly|pre-deploy
#
# Cron (nightly, 03:00 server time):
#   0 3 * * * /opt/tahirelshazli/deploy/backup.sh nightly >> /var/log/tahirelshazli-backup.log 2>&1
#
# Retention is 30 days (BACKUP_RETENTION_DAYS), not "14 daily + 8 weekly":
# docs/legal/privacy-policy.md §7 promises backups are overwritten on a
# rolling 30-day cycle, and the retention window here is what makes that
# promise true rather than aspirational. The newest dump is never deleted,
# even if BACKUP_RETENTION_DAYS is set to 0 - a backup run is not allowed to
# leave zero backups behind.
set -euo pipefail

kind="${1:-}"
if [[ "$kind" != "nightly" && "$kind" != "pre-deploy" ]]; then
  echo "Usage: $(basename "$0") nightly|pre-deploy" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_dir="$(cd "$script_dir/.." && pwd)"
compose_file="$compose_dir/docker-compose.prod.yml"
env_file="$compose_dir/.env"

# POSTGRES_USER from the environment, falling back to the .env next to the
# compose file - the same file docker-compose.prod.yml's `env_file:` reads.
if [[ -z "${POSTGRES_USER:-}" && -f "$env_file" ]]; then
  # shellcheck disable=SC1090
  POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$env_file" | tail -n1 | cut -d= -f2-)"
fi
if [[ -z "${POSTGRES_USER:-}" ]]; then
  echo "POSTGRES_USER is not set and not found in $env_file" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-/var/backups/lms}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_path="$backup_dir/${kind}-${timestamp}.dump"

# Written to a .part file and renamed only on success: a pg_dump that dies
# midway (set -e exits here) must not leave a truncated *.dump behind that the
# retention step below would then treat as the newest good backup.
part_path="$dump_path.part"
umask 077
trap 'rm -f "$part_path"' EXIT
docker compose -f "$compose_file" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc tahirelshazli > "$part_path"

# A zero-byte dump is worse than no dump: it looks like a backup succeeded.
if [[ ! -s "$part_path" ]]; then
  echo "Backup produced an empty file: $dump_path" >&2
  exit 1
fi
mv "$part_path" "$dump_path"
chmod 600 "$dump_path"

echo "Wrote $dump_path ($(du -h "$dump_path" | cut -f1))"

if [[ -n "${BACKUP_OFFSITE_CMD:-}" ]]; then
  eval "$BACKUP_OFFSITE_CMD" "$dump_path"
fi

# Retention: delete dumps older than BACKUP_RETENTION_DAYS, but never the
# newest one - even if every dump in the directory is older than the window,
# at least one backup must survive.
newest="$(ls -t "$backup_dir"/*.dump 2>/dev/null | head -n1 || true)"
if [[ -n "$newest" ]]; then
  find "$backup_dir" -maxdepth 1 -name '*.dump' -type f -mtime "+${retention_days}" ! -path "$newest" -delete
fi
