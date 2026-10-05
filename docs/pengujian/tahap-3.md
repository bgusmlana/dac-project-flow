# Ceklis Pengujian — Tahap 3 (Assembling)

Penguji: ____________ Tanggal: ____________
Akun: `staff.assembling` / `demo12345` (lihat `docs/cara-menjalankan.md`)

## A. Lini produksi
- [ ] A1. Menu **Lini Produksi → Assembling** tampil untuk divisi Assembling (divisi lain tidak melihat menu ini; Admin Project/Manager melihat semua lini).
- [ ] A2. Antrian berisi unit yang sedang di tahap Assembling; filter per project menampilkan jumlah unit.
- [ ] A3. Scan/ketik SN unit di kotak scan → Enter → panel unit terbuka. SN unit yang tidak di tahap Assembling → muncul pesan "sedang di tahap …".
- [ ] A4. Klik SN di tabel antrian juga membuka panel.

## B. Catat komponen
- [ ] B1. Kategori wajib dipilih; pilihan hanya kategori yang berlaku untuk jenis produk unit (Master Data → Jenis Produk).
- [ ] B2. Isi merek, tipe, scan SN komponen → **Tambah** → muncul di daftar. Merek & tipe tidak dikosongkan (mempercepat unit berikutnya), kategori pindah ke kategori berikutnya.
- [ ] B3. SN komponen yang sudah terpasang di unit lain → ditolak.
- [ ] B4. Hapus komponen yang salah (ikon tempat sampah).
- [ ] B5. **Selesai Assembling** tidak aktif kalau belum ada komponen.
- [ ] B6. Selesai → unit hilang dari antrian, muncul di antrian Aktivasi; riwayat unit mencatat "Tahap selesai".
- [ ] B7. Setelah keluar dari Assembling, komponen tidak bisa diubah lagi.

## C. Hak akses
- [ ] C1. Staff divisi lain (misalnya QC) membuka `/work/assembling` → hanya melihat antrian, tanpa kotak scan.

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
