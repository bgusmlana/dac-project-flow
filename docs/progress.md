# Catatan Progres

Entri terbaru di atas. Rencana lengkap: [plan.md](plan.md).

## 2026-10-05 — Panduan deploy aaPanel (tanpa Docker)
- Ditambah `docs/deploy-aapanel.md`: build manual, PM2 (API + worker), Nginx aaPanel, MySQL/Redis bawaan. Belum dijalankan; menunggu izin deploy dari pemilik.

## 2026-09-30 — Istilah "Stasiun" diganti "Lini"
- Menu, judul halaman, kartu Beranda, Pusat Bantuan, dan ceklis uji: "Stasiun QC" → "Lini QC", grup menu "Stasiun Kerja" → "Lini Produksi" (untuk Manager/Super Admin; divisi tetap "Pekerjaan Saya").

## 2026-09-29 — Halaman login baru (tanpa informasi internal)
- Gradasi biru diganti tata letak dua kolom: panel kiri gelap polos berpola titik + logo (hiasan saja, hanya di layar lebar), kanan form bersih (ikon di isian, tombol lihat/sembunyikan password).
- Panel kiri berisi **game ular** (`components/snake-game.tsx`): jalan sendiri (demo) saat dibuka; klik panel untuk main (panah/WASD), skor terbaik disimpan di browser. Tombol hanya ditangkap saat panel aktif, jadi tidak mengganggu mengetik; pindah ke form → kembali ke demo. Berhenti saat tab tidak dilihat.
- Sesuai permintaan pemilik, halaman login **tidak menampilkan detail apa pun** tentang isi aplikasi: tidak ada alur kerja, jenis produk, divisi, atau contoh format username. Pesan salah login dibuat umum ("Username atau password salah."), tidak lagi menyebut akun nonaktif.

## 2026-09-29 — Keamanan: ID acak di URL, batas login, header keamanan
- **ID publik terenkripsi** (`apps/api/src/lib/public-id.ts`): ID angka project, unit, koli, pengiriman, dan foto tidak pernah keluar ke browser. Yang dikirim adalah AES-256 dari (jenis data + ID) → 22 karakter, misalnya `/projects/YJeKgelzlq0tm9alt4OGaQ`. Tidak bisa ditebak/diurutkan, jenis data tidak bisa ditukar (ID project ≠ ID unit), tanpa kolom database baru. Kunci diturunkan dari `APP_ENCRYPTION_KEY` (HKDF) — kunci itu memang tidak boleh diganti, sekarang juga karena alamat halaman ikut berubah.
  - Semua DTO & input di `packages/shared` untuk kelima jenis data kini `string`; route menerjemahkan dengan `pid('unit')` / `decodeId` / `decodeIds`, layanan tetap memakai angka di dalam.
  - Alamat lama berangka (`/api/units/1`) dan ID jenis lain → 404. Log Aktivitas ikut menampilkan & bisa mencari ID publik.
  - Tetap angka (tidak tampil di alamat halaman): item project, komponen, aktivasi, lot, license key, master data, jenis produk (halaman konfigurasi khusus Manager/Super Admin).
- **Batas percobaan login** (`lib/login-limit.ts`, Redis): 5 kali salah per username atau 30 kali per IP dalam 15 menit → dikunci 15 menit (HTTP 429 + pesan di halaman login). Login berhasil menghapus hitungan username.
- **Header keamanan**: API (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP `default-src 'none'`, `Cache-Control: no-store`, HSTS di production); Caddy (CSP untuk web, HSTS, Permissions-Policy — kamera tetap boleh untuk foto QC). `trustProxy` hanya untuk proxy di jaringan internal supaya IP tidak bisa dipalsukan.
- Perbaikan ikutan: upload foto rusak/terlalu kecil kini dijawab 400 dengan pesan jelas (sebelumnya error 500).
- Uji: test baru `public-id.test.ts`, batas login, header, alamat berangka ditolak. Uji browser: halaman utama, detail project/unit, stasiun kerja, license key, riwayat, log aktivitas, cetak surat jalan/label koli/label SN, alur rakit → aktivasi → QC → koli → pengiriman, upload/hapus foto.

## 2026-09-29 — Cek login dipusatkan
- Semua endpoint `/api` (kecuali `/api/auth/*` dan `/api/health`) kini ditolak 401 di satu tempat (`plugins/auth.ts`) sebelum input diproses. Sebelumnya 4 endpoint membalas 400 (validasi) sebelum cek login — tidak membocorkan data, tapi urutannya salah.
- Uji: 99 endpoint dipanggil tanpa login → 98 × 401, 1 × 200 (`/api/health`). Test API 113 lulus.

## 2026-09-29 — Filter Riwayat Pekerjaan menyesuaikan divisi
- Setiap filter kini punya label (Periode, Divisi, Petugas, Project, Tahap, Hasil, Serial number). Komponen baru `Field` (`components/ui-extra.tsx`); juga dipakai di Log Aktivitas.
- **Tahap** hanya tahap milik divisi user (QC → hanya QC, terkunci; Logistik → Ekspedisi/Instalasi). Manager/Super Admin semua tahap.
- **Hasil** memakai istilah tahapnya (QC: Lulus QC / Gagal → dikembalikan / Gagal → cek ulang). Filter disembunyikan kalau hanya ada satu kemungkinan hasil.
- **Project** bawaan: 1 project aktif → project itu langsung terpilih; lebih dari 1 → "Semua project" (hanya yang aktif, API baru `projectStatus=active`); tidak ada yang aktif → semua. Pilihan dikelompokkan aktif vs selesai/dibatalkan.
- Kotak ringkas & kolom rekap menyesuaikan tahap (QC tanpa kolom "Tahap selesai"/"Didaftarkan"; kolom Divisi hanya untuk Manager/Super Admin). Tombol "Kembalikan filter bawaan".

## 2026-09-29 — Reset data & project contoh 100 laptop
- Perintah baru `pnpm db:reset -- --yes` (hapus semua tabel, file upload, dan key antrian Redis milik aplikasi, lalu migrasi ulang; ditolak di production) dan `pnpm db:demo` (reset + data contoh).
- `seed-demo.ts` ditulis ulang menjadi **simulasi**: project *Pengadaan Laptop SMA Negeri 2026 (Demo)* 100 unit, dimulai 8 hari lalu, deadline 2 minggu. Setiap langkah memanggil logika aplikasi yang sama (services) oleh petugas divisinya, lalu waktunya digeser ke hari & jam kerja simulasi, sehingga riwayat, grafik 7 hari, dan log aktivitas realistis.
- Hasil: 40 selesai (2 pengiriman diterima), 40 di Ekspedisi (20 dalam perjalanan, 20 menunggu), 4 Packing, 2 QC, 6 Aktivasi, 8 Assembling. Ada 3 kasus QC gagal (rework ke Aktivasi, cek ulang di QC, rework ke Assembling). 3 staff tambahan (Rudi – Assembling, Dewi – QC, Agus – Packing) supaya rekap per petugas terlihat.
- Database dev `2026_manpro` sudah direset dengan data ini. Catatan: foto belum ada di data contoh.

## 2026-09-29 — Riwayat Pekerjaan & Log Aktivitas (+ perbaikan zona waktu)
- **Menu Riwayat Pekerjaan** (`/history`), sumber data `unit_stage_logs`:
  - Batas data: Staff hanya pekerjaannya sendiri, Leader seluruh anggota divisinya, Manager/Super Admin semua (bisa filter divisi).
  - Filter: rentang tanggal (Hari ini/Kemarin/7 hari/30 hari/Bulan ini/tanggal sendiri), petugas, project, tahap, hasil, SN.
  - Kartu ringkas (total, tahap selesai, lulus QC, gagal/rework), tab **Rekap per Petugas** (total per orang + rincian per hari; klik nama → daftarnya) dan **Daftar Riwayat** (paginasi).
  - **Export Excel** (streaming, sheet Rekap + Riwayat, maks 200.000 baris).
  - QC gagal yang "tetap di QC" kini ikut dicatat (`qc_fail`) supaya terhitung.
- **Menu Log Aktivitas** (`/activity-logs`, Manager & Super Admin): semua perubahan data dari `activity_logs`, filter tanggal/user/jenis data/aksi/ID, klik baris → tabel nilai sebelum & sesudah. Label aksi & jenis data dalam bahasa Indonesia (`packages/shared/src/history.ts`).
- Index baru (migrasi `0005`): `unit_stage_logs(created_at)`, `unit_stage_logs(user_id, created_at)`, `activity_logs(created_at)`.
- **Bug zona waktu diperbaiki**: MySQL Laragon memakai jam WIB, aplikasi membaca sebagai UTC → jam yang diisi otomatis database tampil +7 jam. Kini koneksi database memakai UTC (`SET time_zone = '+00:00'`), dan pengelompokan per hari memakai `APP_TZ_OFFSET` (default `+07:00`, `lib/time.ts`), termasuk grafik Beranda & tanggal di export. Data lama di laptop: kolom `updated_at` yang diubah sebelum perbaikan bisa meleset 7 jam (data demo saja).
- Ketahanan: kalau server sesaat tidak bisa dihubungi, aplikasi mencoba lagi 3× lalu menampilkan "Tidak bisa terhubung ke server · Coba lagi" (sebelumnya user terlempar ke login/Beranda).
- Pusat Bantuan: panduan "Melihat riwayat pekerjaan" + FAQ.
- Test: `test/history.test.ts` (9 test). Total API 112 test lulus.

## 2026-09-29 — Tooltip modern & paginasi lengkap
- **Tooltip** (`components/ui/tooltip.tsx`, Base UI): kotak gelap membulat dengan panah, muncul 0,25 detik setelah kursor diarahkan. `Button` punya prop `tooltip` (sekaligus jadi `aria-label`). Dipasang di semua tombol ikon dengan keterangan jelas (Ubah data, Hapus kelengkapan, Keluarkan dari koli, Lihat key (tercatat), dll.), tombol aksi user, hapus foto, tombol Bantuan, deadline ("3 hari lagi"), dan bar progres (rincian jumlah per tahap).
- **Paginasi** (`Pager` di `components/list-toolbar.tsx`) di semua tabel berhalaman: "Menampilkan 1–50 dari 20.000 unit", pilihan 20/50/100 baris, tombol halaman pertama/sebelumnya/nomor (dengan …)/berikutnya/terakhir, dan kotak loncat ke halaman (kalau lebih dari 7 halaman). Halaman User kini memakai komponen yang sama.
- Diuji di browser: halaman License Key (40 key → 20 baris → 2 halaman), tooltip tampil.

## 2026-09-29 — Kursor tangan & efek hover
- Aturan global di `index.css`: semua link, tombol, item dropdown, pilihan, checkbox, dan ringkasan yang bisa dibuka memakai kursor tangan; tombol/isian nonaktif memakai kursor "dilarang".
- Tautan teks (nama project, SN unit, kode project) kini berwarna biru supaya jelas bisa diklik.
- Efek hover ditambahkan pada elemen yang belum punya: logo sidebar, kartu statistik Beranda, panduan & FAQ di Pusat Bantuan, dropdown pilihan, foto (termasuk tombol hapus foto), dan tombol/tautan di halaman cetak.

## 2026-09-29 — Menu user di navbar & scrollbar modern
- Menu user dipindah dari bawah sidebar ke **pojok kanan atas** (avatar + nama + role). Dropdown berisi **Profil Saya** (ubah nama; username/role/divisi hanya dilihat), **Ganti Password** (password lama wajib benar, ulangi password baru), dan **Keluar**.
- API baru: `PUT /api/me` (ubah nama) dan `POST /api/me/password` (ganti password; perangkat lain otomatis keluar, perangkat ini tetap login). Keduanya tercatat di `activity_logs` (`update_profile`, `change_password`). Test ditambah (API 103 test lulus).
- Scrollbar tipis & membulat (`scrollbar-thin` di `index.css`) untuk isi halaman; di sidebar hanya muncul saat kursor di atas menu.
- Ceklis ditambahkan ke `pengujian/revisi-tampilan.md` (bagian D).

## 2026-09-29 — Revisi tampilan: layout, menu per role, Pusat Bantuan
Permintaan pemilik: desain masih kaku, scroll menu & isi masih gabung, menu belum dibagi per divisi, dan butuh bantuan untuk memahami alur.
- **Layout baru**: menu samping gelap dengan scroll sendiri, bilah atas (cari SN + tombol Bantuan), dan isi halaman dengan scroll sendiri. Di HP, menu menjadi laci geser (tombol ☰).
- **Warna tema**: biru sebagai warna utama, latar abu-abu muda supaya kartu lebih menonjol, halaman login diperbarui.
- **Menu per role** (`apps/web/src/lib/nav.ts`): staff/leader divisi hanya melihat Beranda, stasiun divisinya, dan Pusat Bantuan (+ License Key untuk Aktivasi, + User Divisi Saya untuk Leader). Admin Project melihat Project & Master Data. Manager/Super Admin melihat semua. Halaman yang tidak berhak (Master Data, User, License Key) dialihkan ke Beranda walaupun alamatnya diketik langsung.
- **Beranda**: kartu "Antrian Stasiun …" untuk langsung ke pekerjaan divisi, dan pintasan ke Pusat Bantuan.
- **Pusat Bantuan** (`/help`): diagram alur 7 tahap (klik tahap untuk membuka panduannya), panduan langkah demi langkah per divisi (panduan divisi user tampil paling atas dengan label "Tugas Anda"), pertanyaan umum, daftar istilah, dan kotak cari. Setiap stasiun kerja punya tombol **Panduan** yang langsung membuka bagian yang sesuai.
- Diuji di browser: menu staff.qc, staff.admin, leader.activation, staff.logistics, dan manager; alamat terlarang dialihkan; tampilan lebar 390 px (laci menu, tanpa scroll ke samping). Typecheck & build bersih.
- Ceklis: `pengujian/revisi-tampilan.md`.

## 2026-09-29 — Tahap 3–8 selesai, Tahap 9 disiapkan (deploy DITAHAN)
- **Tahap 3 Assembling**: tabel `unit_components`; stasiun kerja generik `/work/:stage` (antrian per tahap + scan SN); catat komponen (kategori sesuai jenis produk, SN komponen unik), selesai → Aktivasi.
- **Tahap 4 Aktivasi & License Key**: tabel `license_keys` (terenkripsi + hash anti-duplikat) & `activations`; import key, alokasi ke project, buka key tercatat, cabut/kembalikan; aktivasi per unit (key otomatis dari stok dengan SKIP LOCKED, key manual, tanpa key, gagal); aktivasi massal hingga 5.000 unit per proses.
- **Tahap 5 QC**: tabel `qc_inspections`, `qc_inspection_results`, `lots`, `lot_samples`, `attachments`; QC per unit dengan checklist versi aktif; rework ke Assembling/Aktivasi; QC sampling per lot (bentuk lot, sampel acak, lulus otomatis, lot ditahan → keputusan Leader QC/Manager); foto dikompres (maks 1600 px), watermark tanggal·SN·petugas, thumbnail (library `sharp`). Penyimpanan foto: disk lokal via `lib/storage.ts` (menggantikan MinIO yang tidak tersedia).
- **Tahap 6 Packing**: tabel `packages`; koli otomatis `<project>-K0001`, scan SN, cek kelengkapan wajib, segel → Pengiriman, buka segel; cetak label + packing list (barcode).
- **Tahap 7 Ekspedisi & Instalasi**: tabel `shipments`, `installations`; surat jalan `SJ-<project>-001`, scan koli, kirim (ekspedisi/resi), konfirmasi diterima (BAST + foto), pengiriman parsial; instalasi per lokasi; project otomatis Selesai setelah semua unit selesai; cetak surat jalan.
- **Tahap 8**: dashboard (antrian per tahap/bottleneck, throughput 7 hari, deadline, lot ditahan, stok key, pengiriman terakhir); detail unit lengkap untuk garansi; cari lewat SN unit/kelengkapan/**komponen**; export Excel streaming.
- **Tahap 9** (hanya persiapan, atas instruksi user belum deploy): `deploy/` (Dockerfile, docker-compose, Caddyfile, .env.example, backup.sh), `docs/deploy.md`, build production (`apps/api/build.mjs` mem-bundle `@manpro/shared`), script uji beban (belum dijalankan).
- Tambahan: `docs/cara-menjalankan.md` + `pnpm db:seed-demo` (akun demo per divisi, password `demo12345`).
- Masalah ditemukan & diperbaiki: nama constraint otomatis > 64 karakter (lagi, di `qc_inspection_results`); esbuild awalnya tidak mem-bundle paket shared (server production akan gagal) → build script baru; default kategori komponen = kategori pertama abjad (rawan salah input) → kini wajib dipilih.
- Catatan uji browser: alat otomasi browser sering "kehilangan" klik/ketikan pertama; sudah dibuktikan dengan pencatat event bahwa aplikasi normal (klik DOM langsung selalu berhasil).
- Test otomatis: shared 20, api 102 (8 file). Semua lulus. Uji browser end-to-end: assembling → aktivasi massal → QC → packing (tolak unit tanpa charger) → pengiriman → surat jalan → detail unit/garansi.
- Ceklis: `docs/pengujian/tahap-3.md` … `tahap-8.md`.

## 2026-09-29 — Pindah dari Docker ke Laragon
- Atas permintaan user (Docker membuat laptop lag dan penyimpanan membengkak): container, volume, dan image MySQL milik project ini dihapus. Data Docker milik project lain (~15 GB) **tidak disentuh**.
- Development sekarang memakai MySQL 8.0.30 (3306) dan Redis 5.0.14 (6379) dari Laragon. Database: `2026_manpro` dan `2026_manpro_test`.
- Penyebab laptop lag ditemukan: BullMQ v6 butuh paket `ioredis` dipasang terpisah. Tanpa itu, worker terus gagal dan mencoba ulang, sehingga server dev membengkak sampai 4,7 GB RAM dan test menggantung. Sudah diperbaiki (`lib/queue.ts`).
- Catatan: BullMQ menyarankan Redis ≥ 6.2, sedangkan Laragon memakai 5.0.14. Semua fitur yang dipakai berjalan normal; untuk server production pakai Redis 7.

## 2026-09-29 — Tahap 2 selesai (menunggu uji manual)
- Tabel: projects, project_items, units, unit_accessories, unit_stage_logs, project_stage_counters, import_jobs, secret_access_logs.
- Mesin alur (`services/workflow.ts` + `shared/workflow.ts`): status unit = tahap saat ini; `advanceUnits`/`reworkUnits` dipakai semua tahap berikutnya; counter progres dijaga dalam transaksi yang sama.
- Kode project otomatis `PRJ-YYYY-NNNN`. Item menyimpan salinan data produk + urutan tahap + daftar kelengkapan.
- Tambah unit massal (manual ≤ 5.000 atau import Excel/CSV lewat queue BullMQ, batch 1.000 per transaksi): cek SN ganda, SN terdaftar, dan batas jumlah item; error dilaporkan per baris.
- Kolom tambahan unit tervalidasi sesuai jenis produk; kolom rahasia dienkripsi AES-256-GCM (`lib/crypto.ts`, kunci `APP_ENCRYPTION_KEY`) dan setiap pembukaan dicatat.
- File disimpan di disk lokal lewat `lib/storage.ts` (mudah diganti object storage nanti).
- Frontend: daftar project (progres, deadline berwarna), detail project (item, unit, tambah/scan unit, import Excel + progres, riwayat import), detail unit (alur, data tambahan, kelengkapan, riwayat), kotak cari/scan SN di semua halaman.
- Test otomatis: shared 20, api 56 (termasuk import 1.500 baris lewat queue). Semua lulus.
- Ceklis: `docs/pengujian/tahap-2.md`.

## 2026-09-29 — Tahap 1 selesai (menunggu uji manual)
- Tabel baru: clients, vendors, couriers, component_categories, activation_types, software, product_types, product_type_stages, product_type_component_categories, product_type_activation_types, custom_field_definitions, qc_templates, qc_template_items, products.
- API master data generik `/api/master/:kind` (6 jenis master: satu service, satu halaman frontend).
- API `/api/products` (katalog) dan `/api/product-types` (tahapan, komponen, aktivasi, kolom tambahan, template QC).
- Template QC diversikan: setiap simpan membuat versi baru, versi lama tetap ada untuk riwayat inspeksi di Tahap 5.
- Seed: 18 kategori komponen, 7 jenis aktivasi, 4 software, 8 ekspedisi, dan 8 jenis produk lengkap dengan tahapan, komponen, kolom tambahan, dan checklist QC sesuai spesifikasi. Seed tidak menimpa jenis produk yang sudah diubah admin.
- Hak akses: `canManageMasterData` (Super Admin, Manager, divisi Admin Project) dan `canConfigureProductTypes` (Super Admin, Manager). Actor sekarang membawa `divisionCode`.
- Masalah yang ditemukan & diperbaiki: nama constraint otomatis Drizzle melebihi batas 64 karakter MySQL. Constraint tabel penghubung sekarang diberi nama manual. Migrasi yang gagal sempat meninggalkan tabel kosong di database dev/test; sudah dibersihkan.
- Test otomatis: shared 15, api 37 (23 baru). Semua lulus.
- Dicoba di browser: daftar & detail jenis produk (mode baca-saja untuk Leader QC), tambah Vendor, dan edit checklist QC Laptop (tersimpan sebagai versi 2).
- Temuan "klik pertama tidak membuka dialog" dari Tahap 0 **sudah dipastikan bukan bug aplikasi**: dengan pencatat event di halaman, terbukti klik pertama dari alat otomasi tidak pernah sampai ke halaman. Begitu klik sampai, dialog langsung terbuka.
- Ceklis uji manual: `docs/pengujian/tahap-1.md`.

## 2026-09-29 — Tahap 0 selesai (menunggu uji manual)
- Monorepo pnpm: `apps/api`, `apps/web`, `packages/shared`.
- Docker Compose dev: MySQL 8.4 (port 3307) + Redis 7 (port 6380). Database test terpisah `manpro_test`.
- MinIO dikeluarkan dari compose: image Docker resminya sudah tidak tersedia publik. Pilihan penyimpanan foto diputuskan di Tahap 5.
- Backend: Fastify + Drizzle + Better Auth (login pakai username, pendaftaran mandiri dimatikan).
- Tabel: divisions, users, sessions, accounts, verifications, activity_logs.
- Hak akses role & divisi di `packages/shared/src/permissions.ts` (dipakai backend dan frontend).
- API: `/api/me`, `/api/divisions`, `/api/users` (daftar, tambah, ubah, aktif/nonaktif, reset password).
- User nonaktif atau di-reset password langsung dikeluarkan dari semua sesi.
- Audit trail di `activity_logs` (password tidak pernah dicatat).
- Frontend: halaman Login, layout + menu, Dashboard (placeholder), halaman User.
- Test otomatis: 11 (aturan hak akses) + 14 (API login & user) — semua lulus.
- Dicoba di browser: login admin, tambah Leader QC, login sebagai Leader QC (hanya melihat divisi QC, role & divisi terkunci).
- Ceklis uji manual: `docs/pengujian/tahap-0.md`.
- Catatan: saat dicoba lewat otomasi browser, tombol "Tambah User" kadang baru merespons di klik kedua (kemungkinan hanya soal fokus jendela). Masuk ceklis poin B2 untuk dicek manual.

## 2026-09-29 — Perencanaan
- Dokumen spesifikasi, ERD, dan CLAUDE.md dibuat (draft).
- Stack disepakati: Fastify + MySQL 8 + Drizzle + Better Auth + React/Vite + BullMQ/Redis + MinIO + Docker Compose.
- Plan dibuat. Mulai Tahap 0 (Fondasi).
