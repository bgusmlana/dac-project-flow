# CLAUDE.md

Aplikasi web manajemen project produksi perangkat IT (Laptop, AIO, Desktop, Mini PC, Server, Workstation, Interactive Flat Panel, dll.): Project → Assembling → Aktivasi → QC → Packing → Ekspedisi → (Instalasi).

Pemilik project bukan programmer, dan kode dikerjakan oleh AI. Jelaskan keputusan dan hasil dalam bahasa Indonesia yang sederhana.

## Dokumen acuan
- `docs/spesifikasi.md`: alur bisnis, role, aturan. **Baca sebelum mengerjakan fitur.**
- `docs/erd.md`: struktur database.
- `docs/plan.md`: rencana per tahap. **Update centangnya setiap menyelesaikan tugas.**
- `docs/progress.md`: catatan progres (entri terbaru di atas). **Tambahkan entri setiap selesai bekerja.**
- `docs/pengujian/tahap-N.md`: ceklis uji manual. Buat setiap kali satu tahap selesai.

## Perintah
- Database & Redis dari **Laragon** (MySQL 3306 root tanpa password, Redis 6379). **Jangan pakai Docker di laptop.** Database: `2026_manpro` (dev), `2026_manpro_test` (test).
- `pnpm db:migrate`, `pnpm db:seed`
- `pnpm dev`: web (5173, proxy `/api` → 3000) + api (3000)
- `pnpm test`, `pnpm typecheck`, `pnpm build`
- `pnpm --filter @manpro/api db:generate`: buat migrasi setelah mengubah `apps/api/src/db/schema.ts`, lalu `db:migrate`
- Test API memakai database `2026_manpro_test`. Jalankan test dengan batas waktu dan pastikan tidak ada proses node yang menggantung setelahnya.
- BullMQ v6 butuh koneksi ioredis yang dibuat sendiri (lihat `lib/queue.ts`); key Redis diberi prefix `manpro`.

## Struktur kode
- `packages/shared`: enum, skema Zod, aturan hak akses (`permissions.ts`). Dipakai backend & frontend.
- `apps/api/src`: `routes/` (HTTP tipis) → `services/` (logika bisnis + audit) → `db/schema.ts`
- `apps/web/src`: `pages/`, `components/ui` (shadcn, berbasis Base UI, **bukan** Radix), `lib/api.ts`
- Dropdown form memakai `components/native-select.tsx`.
- Kursor tangan untuk elemen yang bisa diklik sudah diatur global (`index.css`). Setiap elemen klik baru WAJIB punya efek hover; tautan teks memakai `text-primary underline-offset-4 hover:underline`.
- Tombol ikon WAJIB diberi keterangan lewat `<Button tooltip="…">`; elemen lain pakai `<Tip label>` (`components/ui/tooltip.tsx`). Jangan pakai atribut `title`.
- Filter/isian diberi label dengan `<Field label>` (`components/ui-extra.tsx`; `group` untuk kumpulan tombol). Pilihan filter menyesuaikan divisi user (tahap sendiri saja).
- Tabel berhalaman memakai `<Pager … onPageSize unit>` dari `components/list-toolbar.tsx`.
- Alur unit: `packages/shared/src/workflow.ts` (status = tahap) + `apps/api/src/services/workflow.ts` (`advanceUnits`, `reworkUnits`, `applyMoves` menjaga counter & riwayat). Semua perpindahan tahap WAJIB lewat sini.
- Lini produksi: `apps/web/src/pages/work/` — panel per tahap didaftarkan di `stage-panels.tsx` (unit = per scan, bulk = per kelompok).
- File/foto: `lib/storage.ts` (disk lokal) + `services/attachments.ts` (sharp: kompres, watermark, thumbnail).
- Build production: `apps/api/build.mjs` (bundle `@manpro/shared`). Deploy: `deploy/` + `docs/deploy.md` — **JANGAN deploy tanpa izin eksplisit user.**
- Uji browser: alat otomasi sering kehilangan klik/ketikan pertama; pakai form_input + klik lewat DOM (javascript) bila perlu.
- Master data sederhana: tambah jenis baru cukup di `masterSchemas` (shared), `TABLES` (`services/master.ts`), dan `MASTER_CONFIG` (web).
- **ID publik**: ID angka project, unit, koli, pengiriman, dan foto TIDAK BOLEH dikirim ke browser. Di DTO pakai `encodeId(kind, id)`, di route pakai `pid(kind)` / `decodeId` / `decodeIds` (`apps/api/src/lib/public-id.ts`); di shared tipenya `string` (`publicIdSchema`). Layanan (services) tetap memakai angka di dalam.
- Semua `/api` wajib login (dicek di `plugins/auth.ts`, kecuali `/api/auth/*` & `/api/health`). Login dibatasi `lib/login-limit.ts`. Header keamanan di `app.ts` (API) dan `deploy/Caddyfile` (web).
- Waktu: koneksi DB selalu UTC (`db/index.ts`). Untuk "hari ini"/pengelompokan per hari pakai `lib/time.ts` (`localToday`, `localRange`, `localDaySql`, zona `APP_TZ_OFFSET`), jangan `new Date().toISOString().slice(0,10)` atau `DATE(kolom)`.
- MySQL membatasi nama constraint 64 karakter. Beri nama manual (`primaryKey({ name })`, `foreignKey({ name })`) kalau nama tabel/kolom panjang.
- Migrasi MySQL tidak transaksional: kalau migrasi gagal di tengah, tabel yang sudah dibuat harus di-drop manual.

## Stack
- Backend: Fastify + TypeScript, Drizzle ORM, MySQL 8, Zod, Better Auth
- Frontend: React + Vite + shadcn/ui + TanStack Table
- Queue: BullMQ + Redis. Foto: penyimpanan S3-compatible (dipilih di Tahap 5, image MinIO tidak tersedia) + sharp
- Deploy (server saja): Docker Compose + Nginx
- API terpisah dari frontend (nantinya dipakai juga oleh aplikasi Android/PWA)

## Konvensi
- Kode, nama tabel, dan kolom dalam bahasa Inggris. Teks tampilan (UI) dalam bahasa Indonesia.
- TypeScript strict. Validasi input dengan Zod di setiap endpoint.
- Kerjakan bertahap per modul sesuai "Tahapan Pengerjaan" di spesifikasi. Setiap modul diuji sebelum lanjut.

## Aturan bisnis penting (jangan dilanggar)
- Master data umum: Super Admin, Manager, divisi Admin Project. Konfigurasi Jenis Produk: Super Admin & Manager saja.
- Hak akses per divisi: Leader hanya bisa mengelola dan melihat user divisinya sendiri, dan tidak bisa membuat role setara atau lebih tinggi. Staff hanya input di tahap divisinya.
- Alur tahapan unit ditentukan oleh Jenis Produk (wajib/opsional/dilewati). Jangan hardcode per jenis produk.
- Serial number unit dan komponen, serta license key (via `key_hash`), harus unik.
- License key dan field rahasia disimpan terenkripsi. Setiap kali dilihat atau disalin, dicatat di `secret_access_logs`.
- Semua perubahan data dicatat di `activity_logs`. User dan master data dinonaktifkan, tidak dihapus.
- Skala project bisa 20.000–50.000 unit: import/export/proses berat lewat queue, operasi massal dalam transaksi, dan dashboard membaca `project_stage_counters`, bukan `COUNT(*)`.
