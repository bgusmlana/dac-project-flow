# Cara Menjalankan Aplikasi di Laptop (Lokal)

Panduan ini untuk Windows dengan **Laragon**. Tidak perlu Docker.

---

## A. Persiapan (cukup sekali)

1. **Node.js 24** atau lebih baru: https://nodejs.org (pilih "LTS", install biasa).
2. **pnpm**: buka *Command Prompt* / *PowerShell*, jalankan:
   ```
   npm install -g pnpm
   ```
3. **Laragon** sudah terpasang (MySQL 8 dan Redis ikut di dalamnya).
4. Di Laragon, buat 2 database kosong. Caranya: klik **Database** (HeidiSQL), lalu klik kanan → *Create new* → *Database*:
   - `2026_manpro` → data aplikasi
   - `2026_manpro_test` → khusus test otomatis
5. Buka folder project di terminal, lalu pasang library:
   ```
   cd D:\CODE\project
   pnpm install
   ```
6. File pengaturan `apps\api\.env` sudah ada di laptop ini. Kalau pindah ke komputer lain, salin dari `apps\api\.env.example` lalu isi `BETTER_AUTH_SECRET` dan `APP_ENCRYPTION_KEY` dengan string acak. Contoh membuatnya:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
7. Buat tabel dan isi data awal:
   ```
   pnpm db:demo
   ```
   `db:demo` = **hapus semua data** lalu isi ulang: divisi, akun Super Admin, master data, akun contoh per divisi, dan 1 project contoh 100 unit laptop yang sudah berjalan 8 hari (lihat bagian C). **Hanya untuk laptop, jangan dipakai di server.**

   Untuk database kosong tanpa contoh: `pnpm db:reset -- --yes` lalu `pnpm db:seed`.

---

## B. Menjalankan (setiap kali mau pakai)

1. Buka **Laragon** → klik **Start All**. Pastikan **MySQL** dan **Redis** berwarna hijau/aktif.
2. Di terminal:
   ```
   cd D:\CODE\project
   pnpm dev
   ```
3. Tunggu sampai muncul tulisan `Server listening at http://127.0.0.1:3000` dan `Local: http://localhost:5173`.
4. Buka browser: **http://localhost:5173**
5. Untuk berhenti: tekan **Ctrl + C** di terminal.

> Jangan tutup jendela terminal selama aplikasi dipakai.

---

## C. Akun Login

### Super Admin
| Username | Password |
|---|---|
| `admin` | `admin12345` |

### Akun demo (dibuat oleh `pnpm db:demo`)
Password semua akun demo: **`demo12345`**

| Username | Role | Divisi |
|---|---|---|
| `manager` | Manager | — |
| `leader.admin` / `staff.admin` | Leader / Staff | Admin Project |
| `leader.assembling` / `staff.assembling` | Leader / Staff | Assembling |
| `leader.activation` / `staff.activation` | Leader / Staff | Aktivasi |
| `leader.qc` / `staff.qc` | Leader / Staff | QC |
| `leader.packing` / `staff.packing` | Leader / Staff | Packing |
| `leader.logistics` / `staff.logistics` | Leader / Staff | Logistik (Ekspedisi & Instalasi) |
| `rudi.assembling` (Rudi Hartono) | Staff | Assembling |
| `dewi.qc` (Dewi Lestari) | Staff | QC |
| `agus.packing` (Agus Setiawan) | Staff | Packing |

> Password ini hanya untuk laptop/percobaan. Di server production, akun dibuat lewat menu **User** dengan password masing-masing.

### Project contoh: *Pengadaan Laptop SMA Negeri 2026 (Demo)*
100 unit Lenovo ThinkPad E14 (SN `PF5K0001`–`PF5K0100`), alur Assembling (upgrade RAM) → Aktivasi → QC → Packing → Ekspedisi. Project dimulai 8 hari lalu, deadline 2 minggu sejak mulai (tinggal 6 hari). Semua langkah dikerjakan oleh petugas divisinya masing-masing dan tersebar di beberapa hari, sehingga Beranda, Riwayat Pekerjaan, dan Log Aktivitas sudah berisi.

| Posisi sekarang | Jumlah | Keterangan |
|---|---|---|
| Selesai (diterima client) | 40 | Pengiriman 001 & 002 sudah diterima (BAST) |
| Ekspedisi | 40 | 20 unit dalam perjalanan (pengiriman 003, JNE), 20 unit (4 koli tersegel) menunggu dikirim |
| Packing | 4 | 3 unit di koli yang belum disegel, 1 unit belum masuk koli |
| QC | 2 | `PF5K0085`, `PF5K0086` |
| Aktivasi | 6 | `PF5K0087`–`PF5K0092` |
| Assembling | 8 | `PF5K0093`–`PF5K0100` |

Contoh kejadian yang bisa dilihat di detail unit: `PF5K0017` (gagal QC → aktivasi ulang), `PF5K0038` (gagal QC, cek ulang, lalu lulus), `PF5K0060` (gagal QC → pasang ulang RAM). Stok license key: 130 diimpor, 88 terpakai.

Mau mengulang dari awal? Jalankan lagi `pnpm db:demo` (semua data di laptop dihapus dan dibuat ulang; tanggalnya menyesuaikan hari itu).

---

## D. Mencoba alur lengkap (saran urutan)

Lanjutkan antrian yang tersisa di project contoh:

1. Login `manager` → **Beranda** dan menu **Project** → buka *Pengadaan Laptop SMA Negeri 2026 (Demo)*.
2. Login `staff.assembling` → **Lini Produksi → Assembling** → klik SN di antrian → catat komponen → *Selesai Assembling*.
3. Login `staff.activation` → **Aktivasi** → pilih project di filter antrian → **Aktivasi Massal** (Windows 11 Pro OEM, ambil key dari stok).
4. Login `staff.qc` → **QC** → klik SN → *Tandai semua lulus* → *Simpan*.
5. Login `staff.packing` → **Packing** → pilih project → *Koli Baru* → scan SN → *Segel Koli* → cetak *Label & Packing List*.
6. Login `staff.logistics` → **Ekspedisi** → pilih project → *Pengiriman Baru* → scan kode koli → pilih ekspedisi & resi → *Kirim* → *Konfirmasi Diterima* → cetak *Surat Jalan*.
7. Login `manager` → **Beranda** untuk melihat progres, **Riwayat Pekerjaan** untuk rekap per petugas, dan kotak **Cari / scan serial number** untuk pelacakan garansi.

Ceklis pengujian lengkap per tahap ada di folder `docs/pengujian/`.

---

## E. Perintah lain

| Perintah | Fungsi |
|---|---|
| `pnpm test` | Menjalankan semua test otomatis (Laragon harus menyala) |
| `pnpm typecheck` | Cek kesalahan kode |
| `pnpm build` | Build versi production |
| `pnpm db:migrate` | Terapkan perubahan struktur database (setelah update kode) |

---

## F. Masalah umum

| Gejala | Solusi |
|---|---|
| `ECONNREFUSED ...3306` | MySQL Laragon belum menyala → Laragon → Start All |
| `ECONNREFUSED ...6379` / import Excel tidak jalan | Redis Laragon belum menyala |
| `Unknown database '2026_manpro'` | Buat database dulu (langkah A.4) |
| Halaman putih / tidak bisa login | Pastikan `pnpm dev` masih berjalan dan buka **http://localhost:5173** (bukan 3000) |
| Port 5173 / 3000 sudah dipakai | Tutup terminal `pnpm dev` lain yang masih terbuka |
| Laptop terasa berat | Hentikan `pnpm dev` dengan Ctrl + C saat tidak dipakai |
