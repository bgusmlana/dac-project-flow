# Ceklis Pengujian — Tahap 1 (Master Data & Jenis Produk)

Penguji: ____________ Tanggal: ____________

## Persiapan
Kalau sudah pernah menjalankan Tahap 0, cukup jalankan migrasi dan seed ulang (data lama tetap aman):
```
pnpm db:migrate
pnpm db:seed
pnpm dev
```
Siapkan akun (buat lewat menu User sebagai `admin`):
- **Staff Admin Project**: role Staff, divisi Admin Project
- **Leader Admin Project**: role Leader Divisi, divisi Admin Project
- **Staff QC**: role Staff, divisi QC
- **Manager**

Cara mengisi: beri tanda `[x]` kalau sesuai, atau tulis catatan kalau tidak sesuai.

---

## A. Menu
- [ ] A1. Di menu kiri ada kelompok **Master Data**: Client, Vendor, Katalog Produk, Jenis Produk, Kategori Komponen, Jenis Aktivasi, Software, Ekspedisi.
- [ ] A2. Menu **User** ada di kelompok **Pengaturan** (tidak tampil untuk Staff).

## B. Data awal
Login sebagai `admin`.
- [ ] B1. **Jenis Produk** berisi 8 jenis: AIO, Aksesoris/Lainnya, Desktop PC, Interactive Flat Panel, Laptop, Mini PC, Server, Workstation.
- [ ] B2. Tahapan setiap jenis sesuai tabel di spesifikasi bagian 5.1 (misalnya Laptop: Assembling *opsional*, Instalasi *dilewati*; Aksesoris: Assembling & Aktivasi *dilewati*).
- [ ] B3. **Kategori Komponen** berisi 18 kategori (Motherboard, RAM, SSD, …).
- [ ] B4. **Jenis Aktivasi**, **Software**, dan **Ekspedisi** sudah berisi contoh data (Windows 11 Pro OEM, Microsoft Office LTSC 2024, JNE, dll.).
- [ ] B5. Buka **Server** → kolom tambahan: Hostname, IP IPMI, Konfigurasi RAID (pilihan), Password IPMI (tercentang *Rahasia*).
- [ ] B6. Buka **Server** → checklist QC berisi POST, Status RAID, IPMI, PSU redundan, Burn-in, Suhu, Catatan.

## C. Master data sederhana (Client, Vendor, dll.)
Login sebagai `admin`.
- [ ] C1. **Client → Tambah Client**: isi nama, jenis *Dinas*, telepon → tersimpan, muncul di tabel.
- [ ] C2. Kolom yang dikosongkan tampil sebagai "—".
- [ ] C3. Tambah client dengan **nama yang sama persis** → muncul pesan "Client dengan nama ini sudah ada".
- [ ] C4. **Ubah** (ikon pensil) → data berubah.
- [ ] C5. **Nonaktifkan** (ikon power) → muncul konfirmasi → data hilang dari daftar.
- [ ] C6. Centang **Tampilkan yang nonaktif** → data muncul lagi dengan status "Nonaktif" (abu-abu). Aktifkan kembali → berhasil.
- [ ] C7. Kolom **Cari** menyaring berdasarkan nama.
- [ ] C8. Ulangi C1–C5 singkat untuk **Vendor**, **Ekspedisi**, **Kategori Komponen**, **Jenis Aktivasi**, **Software**.

## D. Katalog Produk
- [ ] D1. **Tambah Produk**: pilih jenis *Laptop*, merek, tipe, part number, spesifikasi → tersimpan.
- [ ] D2. Tambah produk dengan **merek + part number yang sama** → ditolak ("sudah ada").
- [ ] D3. Dua produk dengan merek sama **tanpa part number** → keduanya boleh tersimpan.
- [ ] D4. Filter **Semua jenis produk → Laptop** → hanya produk laptop yang tampil.
- [ ] D5. Pencarian bisa berdasarkan merek, tipe, atau part number.
- [ ] D6. Spesifikasi panjang terpotong di tabel, dan teks lengkapnya muncul saat kursor diarahkan ke sel.
- [ ] D7. Kolom **Produk** di halaman Jenis Produk bertambah sesuai jumlah produk di katalog.

## E. Pengaturan Jenis Produk
Login sebagai `admin` (atau Manager).
- [ ] E1. **Tambah Jenis Produk** (misalnya nama *Proyektor*, kode *PROYEKTOR*) → langsung diarahkan ke halaman pengaturannya.
- [ ] E2. Tahapan default: semua *Wajib*, kecuali Instalasi *Opsional*. Checklist QC masih kosong.
- [ ] E3. Pilihan tahap **Ekspedisi** tidak bisa diubah (selalu Wajib).
- [ ] E4. Ubah Assembling & Aktivasi jadi *Dilewati*, centang kategori komponen *Remote* → **Simpan Pengaturan Umum** → tersimpan. Di halaman daftar, tahapan tampil dicoret.
- [ ] E5. **Kolom Tambahan → Tambah Kolom**: ketik label "Lumen" → kunci terisi otomatis `lumen`. Tipe *Angka* → Simpan.
- [ ] E6. Tambah kolom tipe **Pilihan** tanpa isi pilihan → Simpan ditolak dengan pesan jelas.
- [ ] E7. Tambah kolom tipe Pilihan dengan isi `XGA, WXGA, Full HD` → tersimpan. Setelah halaman direfresh, pilihan tetap sama.
- [ ] E8. Dua kolom dengan **kunci yang sama** → ditolak.
- [ ] E9. **Checklist QC → Tambah Poin** beberapa kali, isi, atur urutan dengan panah naik/turun → **Simpan** → judul menunjukkan "(versi 1)".
- [ ] E10. Ubah checklist lalu simpan lagi → menjadi "(versi 2)".
- [ ] E11. Hapus semua poin lalu simpan → ditolak ("minimal satu poin").
- [ ] E12. Mengubah satu bagian (misalnya Kolom Tambahan) lalu menyimpan bagian lain (misalnya Checklist QC) → perubahan yang belum disimpan di bagian pertama **tidak hilang**.
- [ ] E13. **Nonaktifkan** jenis produk → hilang dari daftar dan tidak muncul lagi di pilihan saat menambah produk di Katalog.
- [ ] E14. Kode jenis produk yang sudah dipakai (misalnya `LAPTOP`) → ditolak.

## F. Hak akses
- [ ] F1. **Staff Admin Project** bisa menambah/mengubah Client, Vendor, Katalog Produk, dan master lain.
- [ ] F2. **Staff/Leader Admin Project** membuka halaman Jenis Produk → semua isian abu-abu (tidak bisa diubah), dengan keterangan "Hanya Super Admin dan Manager…". Tombol "Tambah Jenis Produk" tidak ada.
- [ ] F3. **Staff QC** bisa melihat semua halaman master data, tapi tidak ada tombol Tambah/Ubah/Nonaktifkan.
- [ ] F4. **Manager** bisa mengubah semua master data dan pengaturan jenis produk.

## G. Audit trail (dicek oleh teknisi)
- [ ] G1. Tabel `activity_logs` mencatat create/update/activate/deactivate untuk master data, produk, dan jenis produk (termasuk `update_custom_fields` dan `save_qc_template`).
- [ ] G2. Tabel `qc_templates` menyimpan semua versi; hanya versi terbaru yang `is_active = 1`.

---

## Test otomatis (dijalankan teknisi)
```
pnpm test
```
Hasil yang diharapkan: semua lulus (lihat angka terbaru di docs/progress.md).

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
