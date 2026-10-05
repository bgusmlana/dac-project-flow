# Ceklis Pengujian — Tahap 0 (Fondasi)

Penguji: ____________ Tanggal: ____________

## Persiapan
1. Pastikan Laragon menyala (MySQL dan Redis aktif).
2. Di folder project jalankan:
   ```
   pnpm install
   pnpm db:migrate
   pnpm db:seed
   pnpm dev
   ```
3. Buka http://localhost:5173
4. Akun awal: username `admin`, password `admin12345`

Cara mengisi: beri tanda `[x]` kalau sesuai, atau tulis catatan kalau tidak sesuai.

---

## A. Login & Logout
- [ ] A1. Membuka http://localhost:5173 tanpa login otomatis diarahkan ke halaman login.
- [ ] A2. Login dengan username/password salah → muncul pesan "Username atau password salah…".
- [ ] A3. Login `admin` / `admin12345` → masuk ke Dashboard, nama "Super Admin" tampil di kiri bawah.
- [ ] A4. Username boleh diketik huruf besar (misalnya `ADMIN`) dan tetap bisa login.
- [ ] A5. Tombol **Keluar** → kembali ke halaman login. Menekan tombol Back di browser tidak bisa masuk lagi tanpa login.
- [ ] A6. Refresh halaman (F5) saat sudah login → tetap login.

## B. Super Admin — Manajemen User
- [ ] B1. Menu **User** tampil. Tabel berisi Super Admin dengan tanda "(Anda)" dan tanpa tombol aksi di barisnya sendiri.
- [ ] B2. **Tambah User** → dialog form terbuka dengan satu kali klik. *(Saat uji otomatis sempat terlihat perlu dua klik, tapi sudah dipastikan penyebabnya alat otomasi, bukan aplikasi.)*
- [ ] B3. Buat **Manager**: pilih role Manager → kolom Divisi hilang. Simpan berhasil.
- [ ] B4. Buat **Leader QC** (role Leader Divisi, divisi QC) → berhasil, muncul di tabel.
- [ ] B5. Buat **Leader Packing** (role Leader Divisi, divisi Packing) → berhasil.
- [ ] B6. Buat user dengan username yang sudah dipakai → muncul pesan "Username sudah dipakai".
- [ ] B7. Buat user dengan password kurang dari 8 karakter → ditolak.
- [ ] B8. Buat user dengan username berisi spasi atau simbol (misalnya `budi qc!`) → ditolak dengan pesan yang jelas.
- [ ] B9. Filter **Semua divisi → QC** → hanya user divisi QC yang tampil.
- [ ] B10. Kolom pencarian: ketik sebagian nama → tabel tersaring.

## C. Leader Divisi
Login sebagai Leader QC.
- [ ] C1. Menu **User** tampil. Subjudul tertulis "User divisi QC".
- [ ] C2. Tabel **hanya** berisi user divisi QC (Super Admin, Manager, dan Leader Packing tidak terlihat).
- [ ] C3. Filter divisi tidak tampil.
- [ ] C4. **Tambah User** → role terkunci "Staff", divisi terkunci "QC".
- [ ] C5. Buat Staff QC → berhasil.
- [ ] C6. Di baris Staff QC ada menu aksi (⋯): Ubah, Reset password, Nonaktifkan.
- [ ] C7. Di baris dirinya sendiri tidak ada menu aksi.

## D. Manager
Login sebagai Manager.
- [ ] D1. Melihat semua user dari semua divisi.
- [ ] D2. Pilihan role saat tambah user hanya **Leader Divisi** dan **Staff** (tidak ada Manager/Super Admin).
- [ ] D3. Tidak ada menu aksi di baris Manager lain maupun Super Admin.

## E. Staff
Login sebagai Staff QC.
- [ ] E1. Menu **User** tidak tampil.
- [ ] E2. Membuka alamat http://localhost:5173/users langsung → muncul pesan tidak memiliki akses (tidak menampilkan daftar user).

## F. Ubah, Reset Password, Nonaktifkan
Login sebagai Leader QC.
- [ ] F1. **Ubah** nama Staff QC → nama berubah di tabel.
- [ ] F2. **Reset password** Staff QC → berhasil. Login Staff QC dengan password lama gagal, dengan password baru berhasil.
- [ ] F3. Saat Staff QC sedang login di browser lain (atau jendela Incognito), lakukan reset password → Staff QC otomatis keluar setelah refresh.
- [ ] F4. **Nonaktifkan** Staff QC → muncul konfirmasi, status berubah "Nonaktif" (baris jadi abu-abu).
- [ ] F5. Staff QC yang nonaktif **tidak bisa login**, dan kalau sedang login langsung keluar setelah refresh.
- [ ] F6. **Aktifkan** kembali → Staff QC bisa login lagi.

## G. Audit Trail (dicek oleh teknisi)
- [ ] G1. Tabel `activity_logs` di database mencatat create/update/deactivate/activate/reset_password beserta user pelakunya.
- [ ] G2. Password tidak pernah tersimpan di `activity_logs`.

## H. Tampilan
- [ ] H1. Di layar HP (atau jendela browser dikecilkan), menu pindah ke atas dan tabel tetap bisa digulir.
- [ ] H2. Notifikasi hijau/merah muncul di kanan atas setelah menyimpan/gagal.

---

## Test otomatis (dijalankan teknisi)
```
pnpm test
```
Hasil yang diharapkan: semua test lulus (lihat angka terbaru di docs/progress.md).

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
