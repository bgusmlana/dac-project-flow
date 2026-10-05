# Ceklis Pengujian — Tahap 2 (Project, Item & Unit)

Penguji: ____________ Tanggal: ____________

## Persiapan
Laragon menyala (MySQL + Redis). Lalu:
```
pnpm db:migrate
pnpm db:seed
pnpm dev
```
Siapkan minimal 1 Client, 1 Vendor, dan 2 produk di Katalog (misalnya 1 Laptop, 1 Server).

---

## A. Project
- [ ] A1. Menu **Project** → **Project Baru** → isi nama, client, PO, deadline, PIC → tersimpan dan langsung masuk halaman detail.
- [ ] A2. Kode project otomatis `PRJ-<tahun>-0001`, project berikutnya `…-0002`.
- [ ] A3. Mode QC **Sampling** tanpa ukuran lot/persen/batas → ditolak.
- [ ] A4. Status awal **Draft**, lalu otomatis berubah **Berjalan** begitu unit pertama ditambahkan.
- [ ] A5. **Ubah** project → data berubah.
- [ ] A6. Ubah status lewat dropdown (Selesai/Dibatalkan) → item & unit tidak bisa ditambah lagi (tombol hilang).
- [ ] A7. Daftar project: cari berdasarkan kode/nama/PO/client, filter status, bar progres tampil.
- [ ] A8. Deadline yang sudah lewat tampil **merah**, yang ≤ 7 hari lagi **oranye**.

## B. Item produk
- [ ] B1. **Tambah Item** → cari produk (ketik merek/tipe/PN) → pilih → vendor, jumlah → simpan.
- [ ] B2. Tahap wajib tampil tercentang tetap; tahap opsional bisa dicentang (misalnya Laptop: Assembling opsional).
- [ ] B3. Kolom **Tahapan** di tabel item sesuai pilihan (misalnya `Aktivasi → QC → Packing → Ekspedisi`).
- [ ] B4. Isi **Kelengkapan** (misalnya `Monitor, Keyboard & Mouse`) → tampil di tabel item.
- [ ] B5. Item tanpa unit bisa **dihapus**; item yang sudah punya unit tidak ada tombol hapus.
- [ ] B6. Item yang sudah punya unit: produk & tahapan terkunci; jumlah tidak boleh dikurangi di bawah jumlah unit.

## C. Tambah unit (scan / tempel)
- [ ] C1. **Tambah / Scan Unit** → pilih item → scan beberapa barcode SN (atau ketik lalu Enter) → hitungan SN bertambah → simpan.
- [ ] C2. Tempel daftar SN dari Excel (satu kolom) → semua terbaca.
- [ ] C3. SN yang sama dua kali di input → satu masuk, satu dilaporkan "ganda".
- [ ] C4. SN yang sudah terdaftar (di project mana pun) → dilaporkan "sudah terdaftar".
- [ ] C5. Jumlah melebihi jumlah item → kelebihan dilaporkan "melebihi jumlah item".
- [ ] C6. Item yang sudah penuh tampil "(penuh)" dan tidak bisa dipilih.

## D. Import Excel (project besar)
- [ ] D1. **Import Excel** → pilih item → **Unduh Template Excel** → file berisi kolom `serial_number`, kolom tambahan jenis produk (misalnya server: hostname, dst.), dan `SN <kelengkapan>`; sheet "Petunjuk" menjelaskan kolom.
- [ ] D2. Isi ± 20.000 SN (misalnya dengan rumus `="LTP-"&TEXT(ROW(),"00000")`), upload → progres persen berjalan, halaman tetap bisa dipakai.
- [ ] D3. Selesai: tampil jumlah berhasil & gagal, daftar baris gagal beserta alasannya (nomor baris sesuai Excel).
- [ ] D4. Tutup dialog saat import berjalan → **Riwayat Import** di bawah halaman tetap memperbarui status.
- [ ] D5. File CSV (pemisah koma atau titik koma) juga bisa.
- [ ] D6. File tanpa kolom `serial_number` → import gagal dengan pesan jelas.
- [ ] D7. File selain .xlsx/.csv → ditolak.
- [ ] D8. Import server dengan kolom `ipmi_password` terisi → di detail unit tampil `••••••••` (terenkripsi).

## E. Daftar & detail unit
- [ ] E1. Tabel unit: cari SN, filter status (angka per status tampil di pilihan), filter item, halaman berikutnya.
- [ ] E2. Kotak **Cari / scan serial number** di atas setiap halaman → langsung membuka detail unit. Bisa juga dengan SN kelengkapan.
- [ ] E3. Detail unit: alur tahapan dengan tahap sekarang tersorot, riwayat (Didaftarkan …).
- [ ] E4. **Data Tambahan** (jenis produk Server): isi hostname, pilih RAID → simpan.
- [ ] E5. Kolom rahasia: **Lihat** → nilai tampil (teknisi: tercatat di tabel `secret_access_logs`).
- [ ] E6. **Kelengkapan**: nama wajib terisi otomatis; scan SN → tambah; hapus; SN kelengkapan ganda ditolak.
- [ ] E7. Tombol **Hapus unit (salah input)** hanya muncul untuk unit yang belum diproses.
- [ ] E8. Staff divisi lain (misalnya QC) membuka unit yang masih di Assembling → form terkunci.

## F. Hak akses
- [ ] F1. Staff divisi Admin Project bisa membuat project, item, dan unit.
- [ ] F2. Staff/Leader divisi lain hanya bisa melihat project & unit (tombol tambah/ubah tidak ada).

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
