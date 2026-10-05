# Deploy ke aaPanel (tanpa Docker)

> **Status: BELUM DIJALANKAN.** Panduan ini disiapkan saja. Deploy hanya dilakukan setelah ada izin eksplisit pemilik project.
> Alternatif memakai Docker: lihat [deploy.md](deploy.md).

## Susunan
```
Browser → Nginx aaPanel (HTTPS)
            ├─ /        → file statis apps/web/dist
            └─ /api/    → Node API (port 3000, dijalankan PM2)
                          Worker antrean (PM2) · MySQL 8 · Redis (aaPanel)
```

## Kebutuhan
- VPS Linux (bukan shared hosting), minimal 4 vCPU / 8 GB RAM, SSD ≥ 100 GB.
- Di aaPanel (App Store): **Nginx**, **MySQL 8.x**, **Redis**, **PM2 Manager** (pasang Node.js 22 atau lebih baru di dalamnya).
- Lewat SSH: `corepack enable` (supaya perintah `pnpm` tersedia).
- Domain yang sudah diarahkan ke IP server.

## 1. Database & Redis
1. aaPanel → **Database** → tambah database `manpro` (user `manpro`, password acak panjang, charset `utf8mb4`).
2. Pastikan Redis berjalan (App Store → Redis). Prefix key sudah diatur aplikasi (`manpro`).

## 2. Ambil kode & build
```
cd /www/wwwroot
git clone <repo> manpro && cd manpro
pnpm install --frozen-lockfile
pnpm --filter @manpro/api build
pnpm --filter @manpro/web build
```

## 3. Berkas rahasia `apps/api/.env`
```
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://manpro:PASSWORD@127.0.0.1:3306/manpro
REDIS_URL=redis://127.0.0.1:6379
BETTER_AUTH_SECRET=<openssl rand -hex 32>
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
BETTER_AUTH_URL=https://DOMAIN
WEB_ORIGIN=https://DOMAIN
STORAGE_DIR=/www/wwwroot/manpro-storage
APP_TZ_OFFSET=+07:00
RUN_WORKER=false
MIGRATIONS_DIR=/www/wwwroot/manpro/apps/api/drizzle
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<password kuat>
```
- `mkdir -p /www/wwwroot/manpro-storage` (folder foto, di luar folder kode supaya aman saat update).
- **Simpan salinan `.env` di tempat aman.** Tanpa `APP_ENCRYPTION_KEY` yang sama, license key & password perangkat tidak bisa dibuka, dan alamat halaman (ID publik) ikut berubah.

## 4. Migrasi & akun admin pertama
```
cd /www/wwwroot/manpro/apps/api
node --env-file=.env dist/migrate.js
node --env-file=.env dist/seed.js      # sekali saja
```

## 5. Jalankan API & worker (PM2 Manager)
Tambah dua proyek di aaPanel → **PM2 Manager** (atau lewat SSH dengan `pm2 start`):

| Nama | Folder | Perintah |
|---|---|---|
| `manpro-api` | `/www/wwwroot/manpro/apps/api` | `node --env-file=.env dist/server.js` |
| `manpro-worker` | `/www/wwwroot/manpro/apps/api` | `node --env-file=.env dist/worker.js` |

Pastikan keduanya status *online*, lalu `pm2 save` supaya hidup lagi setelah server restart.

## 6. Website & Nginx
1. aaPanel → **Website** → Add site (domain Anda, PHP: *Static*), root `/www/wwwroot/manpro/apps/web/dist`.
2. **SSL** → Let's Encrypt → aktifkan *Force HTTPS*.
3. Buka **Config** situs, isi di dalam blok `server { ... }` (ganti rule `location /` bawaan bila ada):
```
client_max_body_size 60m;

location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}

location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
    try_files $uri /index.html;
}

add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy same-origin always;
add_header X-Frame-Options DENY always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
```
4. Buka `https://DOMAIN`, login, **ganti password admin**.

## 7. Backup (aaPanel → Cron)
- Backup database `manpro`: tugas *Backup database* harian (simpan 14 hari).
- Backup folder foto: tugas *Backup directory* untuk `/www/wwwroot/manpro-storage`.
- Simpan salinan `apps/api/.env` secara terpisah.

## Update aplikasi
```
cd /www/wwwroot/manpro && git pull
pnpm install --frozen-lockfile
pnpm --filter @manpro/api build && pnpm --filter @manpro/web build
cd apps/api && node --env-file=.env dist/migrate.js
pm2 restart manpro-api manpro-worker
```

## Pemeriksaan jika bermasalah
- API: `curl http://127.0.0.1:3000/api/health` harus membalas OK.
- Login gagal / cookie tidak tersimpan → cek `BETTER_AUTH_URL` & `WEB_ORIGIN` harus persis `https://DOMAIN`.
- Upload ditolak → cek `client_max_body_size`.
- Import/export tidak jalan → cek `manpro-worker` online dan Redis aktif.
- Foto gagal diproses → pastikan folder `STORAGE_DIR` bisa ditulis oleh user yang menjalankan PM2.
