# Ceklis Pengujian — Revisi Tampilan (menu per role & Pusat Bantuan)

Penguji: ____________ Tanggal: ____________
Password akun demo: `demo12345` (admin: `admin12345`)

## A. Layout
- [ ] A1. Halaman panjang (misalnya Pusat Bantuan) digulir → menu samping **tidak ikut bergulir**.
- [ ] A2. Menu samping yang panjang (akun manager) bisa digulir sendiri tanpa menggeser isi halaman.
- [ ] A3. Bilah atas berisi kotak **Cari / scan serial number** dan tombol **Bantuan**.
- [ ] A4. Di HP: tombol ☰ membuka menu dari kiri; memilih menu atau mengetuk area gelap menutupnya. Tidak ada geser ke samping.

## B. Menu sesuai role
- [ ] B1. `staff.qc` → hanya Beranda, Lini QC, Pusat Bantuan.
- [ ] B2. `leader.qc` → seperti B1 + **User Divisi Saya**.
- [ ] B3. `staff.activation` → Beranda, Lini Aktivasi, License Key, Pusat Bantuan.
- [ ] B4. `staff.logistics` → Beranda, Lini Ekspedisi, Lini Instalasi, Pusat Bantuan.
- [ ] B5. `staff.admin` → Beranda, Project, Master Data (tanpa Jenis Produk), Pusat Bantuan.
- [ ] B6. `manager` / `admin` → semua menu.
- [ ] B7. Login `staff.qc`, ketik alamat `/master/clients` atau `/users` → dialihkan ke Beranda.
- [ ] B8. Beranda staff divisi menampilkan kartu biru **Antrian Lini …** → klik → masuk lininya.

## C. Pusat Bantuan
- [ ] C1. Diagram alur 7 tahap + Selesai tampil rapi; klik satu tahap → panduannya terbuka dan halaman bergulir ke sana.
- [ ] C2. Panduan divisi sendiri ada di atas dengan label **Tugas Anda** dan sudah terbuka.
- [ ] C3. Kotak cari (misalnya "koli", "lupa password") menyaring panduan, pertanyaan umum, dan istilah.
- [ ] C4. Tombol **Panduan** di lini produksi → membuka Pusat Bantuan tepat di panduan lini itu.
- [ ] C5. Isi panduan sesuai dengan cara kerja di lapangan (tandai bagian yang perlu diubah di Catatan temuan).

## D. Menu user & scrollbar
- [ ] D1. Pojok kanan atas: avatar inisial + nama + role. Klik → dropdown **Profil Saya**, **Ganti Password**, **Keluar**.
- [ ] D2. Profil Saya → ubah nama → Simpan → nama di pojok kanan & Beranda ikut berubah. Username tidak bisa diubah.
- [ ] D3. Ganti Password: password lama salah → "Password lama salah". Ulangi password tidak sama → pesan merah, tombol tidak aktif.
- [ ] D4. Ganti password berhasil → tetap login di browser ini; browser/HP lain yang login dengan akun sama otomatis keluar. Login berikutnya harus pakai password baru.
- [ ] D5. Keluar → kembali ke halaman login.
- [ ] D6. Scrollbar isi halaman tipis & membulat; scrollbar menu samping hanya muncul saat kursor di atas menu.

## E. Kursor & hover
- [ ] E1. Arahkan kursor ke menu, tombol, link, dropdown, checkbox, item dropdown user → kursor berubah menjadi tangan dan tampilannya berubah (warna/latar/garis bawah).
- [ ] E2. Tombol yang nonaktif (misalnya **Selesai Assembling** sebelum ada komponen) → kursor tanda "dilarang".
- [ ] E3. Tautan di tabel (nama project, SN unit) berwarna biru dan bergaris bawah saat diarahkan kursor.

## F. Tooltip
- [ ] F1. Arahkan kursor ke tombol ikon (pensil, tempat sampah, mata, dll.) → muncul keterangan gelap berpanah, misalnya "Ubah data", "Hapus kelengkapan", "Lihat key (tercatat)".
- [ ] F2. Arahkan kursor ke tanggal deadline → "N hari lagi" / "Lewat N hari"; ke bar progres → rincian jumlah unit per tahap.

## G. Paginasi
- [ ] G1. Di bawah tabel tampil "Menampilkan 1–50 dari N …" dengan angka bertitik ribuan.
- [ ] G2. **Tampilkan 20/50/100 baris** → jumlah baris berubah dan kembali ke halaman 1.
- [ ] G3. Tombol «, ‹, nomor halaman, ›, » berfungsi; halaman aktif berwarna biru; tombol di ujung nonaktif.
- [ ] G4. Data lebih dari 7 halaman → kotak **Hal.** + **Buka** untuk loncat ke halaman tertentu.
- [ ] G5. Berlaku di: Project, unit di detail Project, antrian Lini Produksi, License Key, Master Data, Katalog Produk, User.

## H. Riwayat Pekerjaan
Kerjakan beberapa unit dulu dengan akun `staff.qc` (lulus 1, gagal-tetap di QC 1, gagal-rework 1) dan `staff.activation`.
- [ ] H1. `staff.qc` → menu **Riwayat Pekerjaan** → hanya pekerjaan dirinya; tab **Rekap per Hari** dan **Daftar Riwayat**; tidak ada pilihan petugas.
- [ ] H2. Hasil tampil jelas: "Lulus QC" (abu), "Gagal QC (cek ulang)" dan "Gagal QC → Aktivasi" (merah).
- [ ] H3. `leader.qc` → melihat semua anggota divisi QC (bukan divisi lain); pilihan petugas hanya anggota QC.
- [ ] H4. `manager` → semua divisi; filter divisi, petugas, project, tahap, hasil, SN berfungsi.
- [ ] H5. Tombol tanggal cepat (Hari ini, Kemarin, 7 hari, 30 hari, Bulan ini) dan tanggal manual berfungsi.
- [ ] H6. Rekap per Petugas: klik nama → pindah ke Daftar Riwayat dengan filter petugas itu.
- [ ] H7. **Export Excel** → file berisi sheet "Rekap per Petugas" dan "Riwayat" sesuai filter.
- [ ] H8a. Setiap filter punya label. Login `staff.qc`/`leader.qc`: Tahap hanya **QC** (terkunci); Hasil: Lulus QC / Gagal → dikembalikan / Gagal → cek ulang. Login `staff.logistics`: Tahap Ekspedisi/Instalasi.
- [ ] H8b. Filter Project bawaan: 1 project aktif → project itu langsung terpilih; lebih dari 1 → **Semua project** (hanya yang aktif); tidak ada yang aktif → semua. Project selesai tetap bisa dipilih di kelompok "Project selesai / dibatalkan".
- [ ] H8c. Untuk QC, kotak ringkas hanya Total, Lulus QC, Gagal; tabel rekap tanpa kolom Didaftarkan/Divisi.
- [ ] H8. Jam di riwayat sesuai jam kerja sebenarnya (WIB), tidak maju 7 jam.

## I. Log Aktivitas (Manager / Super Admin)
- [ ] I1. Menu **Log Aktivitas** hanya tampil untuk Manager & Super Admin; akun lain membuka `/activity-logs` → dialihkan.
- [ ] I2. Ubah data (misalnya nama client) → muncul "Ubah · Client"; klik baris → nilai sebelum (merah dicoret) dan sesudah (hijau).
- [ ] I3. Filter tanggal, user, jenis data, aksi, dan cari ID berfungsi.

## J. Koneksi terputus
- [ ] J1. Matikan API sebentar lalu muat ulang halaman → muncul "Tidak bisa terhubung ke server" dengan tombol **Coba lagi** (tidak terlempar ke halaman login). Nyalakan API → **Coba lagi** → kembali normal.

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
