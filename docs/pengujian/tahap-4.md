# Ceklis Pengujian — Tahap 4 (Aktivasi & License Key)

Penguji: ____________ Tanggal: ____________
Akun: `staff.activation` / `demo12345`

## A. Stok license key (menu **Lisensi → License Key**)
- [ ] A1. Menu hanya tampil untuk Super Admin, Manager, dan divisi Aktivasi.
- [ ] A2. **Import Key**: pilih jenis (misalnya Windows 11 Pro OEM), tempel beberapa key (satu per baris) atau pilih file .txt → jumlah key terbaca tampil → import berhasil.
- [ ] A3. Import ulang key yang sama (huruf kecil/spasi berbeda) → dilaporkan "sudah ada (dilewati)".
- [ ] A4. Tabel **Stok** menampilkan jumlah per status (Tersedia, Teraktivasi, …) per jenis dan per alokasi project.
- [ ] A5. Daftar key tampil **tersamar** (`XXXXX-…-12345`). Ikon mata → key utuh tampil (teknisi: tercatat di `secret_access_logs`).
- [ ] A6. **Alokasi ke Project**: pindahkan N key dari stok umum ke project → stok berubah. Jumlah melebihi stok → ditolak.
- [ ] A7. **Cabut** key tersedia → status Dicabut; **Kembalikan ke stok** → Tersedia lagi.
- [ ] A8. Cari key berdasarkan 5 karakter terakhir atau SN unit.

## B. Aktivasi per unit (Lini Aktivasi)
- [ ] B1. Scan SN → panel aktivasi. Pilihan jenis aktivasi hanya yang berlaku untuk jenis produk; software dari master Software.
- [ ] B2. Mode **Ambil key dari stok** → key otomatis terpasang (key alokasi project dipakai lebih dulu).
- [ ] B3. Mode **Ketik / scan key** → key baru langsung terdaftar; key yang sudah dipakai unit lain → ditolak.
- [ ] B4. Mode **Tanpa key** (lisensi digital) → tercatat tanpa key.
- [ ] B5. Centang **Aktivasi gagal** + catatan → tercatat GAGAL; tidak dihitung saat menyelesaikan.
- [ ] B6. Hapus aktivasi → key kembali ke stok (Tersedia).
- [ ] B7. **Selesai Aktivasi** hanya aktif jika ada minimal satu aktivasi berhasil → unit pindah ke QC.

## C. Aktivasi massal (project besar)
- [ ] C1. Pilih project di filter antrian → **Aktivasi Massal** → pilih jenis, jumlah unit (kosong = semua), centang ambil key & langsung selesaikan → **Jalankan**.
- [ ] C2. Notifikasi: jumlah unit diaktivasi, key dipakai, unit lanjut ke QC.
- [ ] C3. Stok key kurang dari jumlah unit → ditolak, **tidak ada** unit yang teraktivasi sebagian.

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
