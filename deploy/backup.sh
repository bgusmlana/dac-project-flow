#!/bin/sh
# Backup harian database + foto/dokumen.
# Pasang di cron server (jam 02:00 setiap hari):
#   0 2 * * * /opt/manpro/deploy/backup.sh >> /var/log/manpro-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
set -a
. ./.env
set +a

TS=$(date +%Y%m%d-%H%M)
DIR=${BACKUP_DIR:-/var/backups/manpro}
KEEP=${BACKUP_KEEP_DAYS:-14}
mkdir -p "$DIR"

echo "[$(date)] Backup database…"
docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines manpro' | gzip > "$DIR/db-$TS.sql.gz"

echo "[$(date)] Backup foto & dokumen…"
docker run --rm -v "manpro_storage:/data/storage:ro" -v "$DIR:/backup" alpine tar czf "/backup/storage-$TS.tar.gz" -C /data storage

echo "[$(date)] Hapus backup lebih dari $KEEP hari…"
find "$DIR" -name '*.gz' -mtime +"$KEEP" -delete

echo "[$(date)] Selesai: $DIR/db-$TS.sql.gz, $DIR/storage-$TS.tar.gz"
