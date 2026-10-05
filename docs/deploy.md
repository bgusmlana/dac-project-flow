# Panduan Deploy ke Server

> **Status: BELUM DIJALANKAN.** File-file di folder `deploy/` sudah disiapkan, tapi belum pernah di-build/dijalankan di server.
> Deploy baru dilakukan setelah aplikasi ditinjau dan direvisi oleh pemilik project.

> Memakai aaPanel tanpa Docker? Lihat [deploy-aapanel.md](deploy-aapanel.md).

## Isi folder `deploy/`
| File | Fungsi |
|---|---|
| `docker-compose.yml` | MySQL 8.4, Redis 7, API, worker (antrian), web (Caddy) |
| `Dockerfile` | Build image API & web dari repository |
| `Caddyfile` | Web server + HTTPS otomatis (Let's Encrypt) + meneruskan `/api` ke API |
| `.env.example` | Contoh pengaturan rahasia (disalin menjadi `.env`) |
| `backup.sh` | Backup harian database + foto |

Catatan: spesifikasi awal menyebut Nginx. Diganti **Caddy** karena sertifikat HTTPS-nya otomatis dibuat & diperpanjang tanpa pengaturan tambahan.

## Kebutuhan server
- VPS Linux (Ubuntu 22.04/24.04), 4 vCPU, 8 GB RAM, SSD ≥ 200 GB.
- Docker + Docker Compose terpasang.
- Domain yang sudah diarahkan (DNS A record) ke IP server; port 80 & 443 terbuka.

## Langkah (ringkas)
1. Salin repository ke server, misalnya `/opt/manpro`.
2. `cd /opt/manpro/deploy && cp .env.example .env`, isi semua nilai (`openssl rand -hex 32` untuk rahasia).
3. **Simpan salinan `.env` di tempat aman.** Tanpa `APP_ENCRYPTION_KEY` yang sama, license key & password perangkat tidak bisa dibuka, dan semua alamat halaman (link project/unit yang pernah disimpan atau dibagikan) ikut berubah.
4. `docker compose up -d --build`
5. Buat akun Super Admin & master data: `docker compose exec api node dist/seed.js`
6. Buka `https://<domain>`, login, lalu **ganti password admin**.
7. Pasang backup harian di cron: `0 2 * * * /opt/manpro/deploy/backup.sh >> /var/log/manpro-backup.log 2>&1`

## Update aplikasi
```
cd /opt/manpro && git pull
cd deploy && docker compose up -d --build
```
Migrasi database berjalan otomatis setiap container API menyala.

## Restore dari backup
```
gunzip -c /var/backups/manpro/db-YYYYMMDD-HHMM.sql.gz | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" manpro'
docker run --rm -v manpro_storage:/data/storage -v /var/backups/manpro:/backup alpine tar xzf /backup/storage-YYYYMMDD-HHMM.tar.gz -C /data
```

## Uji beban
Script `pnpm --filter @manpro/api load-test` (50.000 unit: import, daftar unit, aktivasi massal, dashboard, export) sudah disiapkan tapi **belum dijalankan** (berat untuk laptop). Jalankan di server staging sebelum go-live, dengan `DATABASE_URL` mengarah ke database test.
