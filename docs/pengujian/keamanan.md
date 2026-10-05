# Ceklis Pengujian — Keamanan

Penguji: ____________ Tanggal: ____________

## A. ID acak di alamat halaman
- [ ] A1. Buka project, unit, cetak label koli, cetak surat jalan, cetak label SN → alamatnya berupa kode acak 22 karakter (misalnya `/projects/YJeKgelzlq0tm9alt4OGaQ`), bukan angka.
- [ ] A2. Ketik alamat berangka (misalnya `/projects/1` atau `/units/100`) → data tidak ditemukan.
- [ ] A3. Ubah 1 huruf pada kode di alamat → data tidak ditemukan.
- [ ] A4. Semua fitur tetap jalan: lini produksi (scan, rakit, aktivasi massal, QC, koli, pengiriman), foto (upload, lihat, hapus), export Excel, riwayat pekerjaan, log aktivitas (tautan ke unit/project).
- [ ] A5. Salin alamat sebuah unit, logout, buka alamat itu → diminta login.

## B. Batas percobaan login
- [ ] B1. Login dengan password salah 5 kali untuk satu username → percobaan ke-6 (walaupun benar) ditolak dengan pesan "Terlalu banyak percobaan login yang salah. Coba lagi dalam 15 menit."
- [ ] B2. Username lain tetap bisa login normal.
- [ ] B3. Setelah 15 menit, username itu bisa login lagi.

## C. Lainnya
- [ ] C1. Upload file rusak / gambar sangat kecil sebagai foto → pesan jelas ("File foto rusak…" / "Foto terlalu kecil…"), bukan error server.
- [ ] C2. (Server, setelah deploy) cek header keamanan di https://securityheaders.com → nilai minimal A.

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
