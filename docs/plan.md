# Rencana Pengerjaan

Acuan: [spesifikasi.md](spesifikasi.md) · [erd.md](erd.md) · Catatan progres: [progress.md](progress.md) · Ceklis uji: [pengujian/](pengujian/)

Aturan kerja:
- Dikerjakan per tahap, berurutan. Satu tahap dianggap **selesai** kalau semua tugasnya tercentang, test otomatis lulus, dan ceklis pengujian manual sudah dibuat.
- Ceklis pengujian manual ada di `docs/pengujian/tahap-N.md`, diisi oleh penguji (manusia).
- 10 pertanyaan di spesifikasi bagian 13 **ditunda**. Sementara memakai asumsi di bawah, dan bisa diubah nanti.

Asumsi sementara (menunggu keputusan bos):
- Divisi: Admin Project, Assembling, Aktivasi, QC, Packing, Logistik.
- Yang boleh melihat license key utuh: Super Admin, Manager, dan divisi Aktivasi.
- Format ID project: `PRJ-YYYY-NNNN`.
- Tahap Instalasi disediakan tapi opsional.
- Master data umum (Client, Vendor, Katalog, dll.) dikelola Super Admin, Manager, dan divisi Admin Project. Konfigurasi Jenis Produk hanya oleh Super Admin & Manager. Semua user bisa melihat.
- Tahap Ekspedisi selalu wajib untuk semua jenis produk.
- Development di laptop memakai MySQL & Redis **Laragon** (bukan Docker). Docker Compose hanya untuk server.
- Tahap opsional dipilih per **item project** (bukan per unit). Setelah item punya unit, tahapannya dikunci.
- Project/item/unit dikelola Super Admin, Manager, dan divisi Admin Project. Divisi Logistik mengerjakan Ekspedisi dan Instalasi.

Legenda: `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai

---

## Tahap 0 — Fondasi ✅ (menunggu uji manual)
- [x] Struktur monorepo (pnpm workspace): `apps/api`, `apps/web`, `packages/shared`
- [x] Docker Compose untuk development: MySQL 8, Redis (penyimpanan foto menyusul di Tahap 5)
- [x] Backend Fastify + TypeScript + Drizzle + koneksi MySQL + migrasi
- [x] Login (Better Auth, pakai username), logout, session
- [x] Tabel divisi + seed data awal (divisi, akun Super Admin)
- [x] Aturan hak akses role & divisi (Super Admin, Manager, Leader, Staff)
- [x] Manajemen user: daftar, tambah, ubah, nonaktifkan, reset password (dibatasi per divisi)
- [x] Audit trail (`activity_logs`)
- [x] Frontend React + Vite + Tailwind + shadcn/ui: halaman login, layout + menu, halaman user
- [x] Test otomatis: aturan hak akses + API user
- [x] Ceklis pengujian `pengujian/tahap-0.md`

## Tahap 1 — Master Data & Jenis Produk ✅ (menunggu uji manual)
- [x] Client, Vendor, Ekspedisi, Kategori Komponen, Jenis Aktivasi, Software (CRUD + nonaktifkan)
- [x] Jenis Produk: pengaturan tahapan (wajib/opsional/dilewati)
- [x] Jenis Produk: kategori komponen & jenis aktivasi yang berlaku
- [x] Jenis Produk: kolom tambahan (custom field)
- [x] Template checklist QC per jenis produk
- [x] Katalog Produk
- [x] Seed contoh data jenis produk (Laptop, AIO, Desktop, Mini PC, Server, Workstation, IFP)
- [x] Test otomatis + ceklis `pengujian/tahap-1.md`

## Tahap 2 — Project, Item & Unit ✅ (menunggu uji manual)
- [x] CRUD Project (kode otomatis, client, PO, deadline, PIC, mode QC)
- [x] Item produk per project
- [x] Unit: tambah manual + scan
- [x] Import SN dari Excel lewat queue (BullMQ) + laporan baris gagal
- [x] Kelengkapan produk bundel (unit induk-anak)
- [x] Riwayat status unit (`unit_stage_logs`) + counter progres
- [x] Mesin alur tahapan berdasarkan jenis produk
- [x] Test otomatis + ceklis `pengujian/tahap-2.md`

## Tahap 3 — Assembling ✅ (menunggu uji manual)
- [x] Input komponen per unit (kategori, merek, tipe, SN) dengan scan
- [x] Validasi SN komponen unik
- [x] Selesaikan assembling → pindah tahap
- [x] Test otomatis + ceklis `pengujian/tahap-3.md`

## Tahap 4 — Aktivasi & License Key ✅ (menunggu uji manual)
- [x] Enkripsi license key + hash anti-duplikat
- [x] Import license key massal + alokasi ke project
- [x] Input aktivasi per unit (OS & software) + auto-assign key
- [x] Tampilan tersamar + log akses key
- [x] Test otomatis + ceklis `pengujian/tahap-4.md`

## Tahap 5 — QC ✅ (menunggu uji manual)
- [x] Penyimpanan foto + kompresi + watermark. **Catatan:** image Docker MinIO sudah tidak tersedia publik, jadi perlu dipilih alternatif S3-compatible (misalnya Garage/SeaweedFS/RustFS) atau disk lokal
- [x] QC per unit dengan checklist template
- [x] QC sampling per lot (pembentukan lot, sampel, tahan lot)
- [x] Rework (kembali ke tahap sebelumnya dengan alasan)
- [x] Test otomatis + ceklis `pengujian/tahap-5.md`

## Tahap 6 — Packing ✅ (menunggu uji manual)
- [x] Koli: buat, scan unit masuk koli, segel
- [x] Cek kelengkapan bundel sebelum segel
- [x] Label barcode koli/unit + packing list (PDF)
- [x] Test otomatis + ceklis `pengujian/tahap-6.md`

## Tahap 7 — Ekspedisi & Instalasi ✅ (menunggu uji manual)
- [x] Pengiriman (parsial), scan koli, resi, surat jalan (PDF)
- [x] Konfirmasi diterima + BAST + foto
- [x] Instalasi (opsional)
- [x] Test otomatis + ceklis `pengujian/tahap-7.md`

## Tahap 8 — Dashboard & Laporan ✅ (menunggu uji manual)
- [x] Dashboard progres per project & bottleneck
- [x] Pencarian garansi (SN unit/komponen)
- [x] Riwayat unit (timeline)
- [x] Export Excel/PDF
- [x] Test otomatis + ceklis `pengujian/tahap-8.md`

## Revisi tampilan (masukan pemilik, 2026-09-29) ✅ menunggu uji manual
- [x] Scroll menu samping terpisah dari isi halaman; menu laci di HP
- [x] Menu hanya menampilkan pekerjaan divisi user + pembatasan alamat langsung
- [x] Pusat Bantuan: alur kerja, panduan per divisi, FAQ, istilah
- [x] Scrollbar modern; menu user di navbar (Profil, Ganti Password, Keluar)
- [x] Kursor & hover, tooltip modern, paginasi lengkap
- [x] Riwayat Pekerjaan (per staff/divisi/semua) + Log Aktivitas + export Excel
- [x] Perbaikan zona waktu database
- [x] Keamanan: ID acak di URL, batas percobaan login, header keamanan, cek login terpusat (`pengujian/keamanan.md`)
- [x] Ceklis `pengujian/revisi-tampilan.md`

## Tahap 9 — Deploy ⏸️ (ditahan: menunggu review & revisi dari pemilik)
- [x] Konfigurasi production di `deploy/`: Docker Compose + Caddy (HTTPS otomatis, pengganti Nginx) — **belum pernah dijalankan**
- [x] Script backup harian database & foto (`deploy/backup.sh`)
- [x] Panduan instalasi server (`docs/deploy.md`)
- [x] Panduan menjalankan di laptop + akun demo (`docs/cara-menjalankan.md`, `pnpm db:demo`)
- [ ] Uji beban 50.000 unit — script siap (`pnpm --filter @manpro/api load-test`), belum dijalankan (berat untuk laptop; jalankan di server staging)
- [ ] Deploy ke server — **menunggu persetujuan**
- [ ] Ceklis `pengujian/tahap-9.md` (dibuat saat deploy)
