# Manajemen Project

Aplikasi web untuk melacak project pengadaan perangkat IT: Project → Assembling → Aktivasi → QC → Packing → Ekspedisi.

- Spesifikasi: [docs/spesifikasi.md](docs/spesifikasi.md)
- Rencana & progres: [docs/plan.md](docs/plan.md), [docs/progress.md](docs/progress.md)
- Ceklis pengujian: [docs/pengujian/](docs/pengujian/)
- **Cara menjalankan di laptop + akun login: [docs/cara-menjalankan.md](docs/cara-menjalankan.md)**
- Deploy ke server (belum dijalankan): [docs/deploy.md](docs/deploy.md)

## Struktur
```
apps/api        Backend (Fastify + Drizzle + Better Auth)
apps/web        Frontend (React + Vite + shadcn/ui)
packages/shared Enum, validasi (Zod), aturan hak akses — dipakai backend & frontend
```

## Menjalankan di komputer lokal
Butuh: Node.js 24+, pnpm, **Laragon** (MySQL 8 di port 3306 dan Redis di port 6379 dalam keadaan menyala). Docker tidak dipakai di laptop.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # lalu isi BETTER_AUTH_SECRET dengan string acak
# Buat database 2026_manpro dan 2026_manpro_test di MySQL Laragon (HeidiSQL / phpMyAdmin), lalu:
pnpm db:migrate                          # buat tabel
pnpm db:seed                             # isi divisi, akun admin, master data awal
pnpm dev                                 # web: http://localhost:5173, api: http://localhost:3000
```

Akun awal: `admin` / `admin12345`. Data contoh (akun per divisi + project 100 laptop yang sedang berjalan): jalankan `pnpm db:demo` — menghapus semua data lokal (password akun demo `demo12345`), daftar lengkap di [docs/cara-menjalankan.md](docs/cara-menjalankan.md).

## Perintah lain
| Perintah | Fungsi |
|---|---|
| `pnpm test` | Semua test otomatis (butuh MySQL & Redis Laragon menyala) |
| `pnpm typecheck` | Cek tipe TypeScript |
| `pnpm build` | Build production |
| `pnpm db:migrate` / `pnpm db:seed` | Jalankan migrasi / isi data awal |
| `pnpm --filter @manpro/api db:generate` | Buat file migrasi setelah mengubah `apps/api/src/db/schema.ts` |
