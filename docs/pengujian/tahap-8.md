# Ceklis Pengujian — Tahap 8 (Dashboard, Garansi & Laporan)

Penguji: ____________ Tanggal: ____________
Akun: `admin` / `admin12345` dan `manager` / `demo12345`

## A. Dashboard
- [ ] A1. Kartu ringkas: jumlah project aktif, lewat deadline (merah), deadline ≤ 7 hari (oranye), lot QC ditahan.
- [ ] A2. **Antrian per Tahap**: batang per tahap; tahap dengan antrian terbanyak disebut sebagai bottleneck. Klik baris → lini produksi tahap itu.
- [ ] A3. **Unit Selesai per Tahap (7 hari)**: angka bertambah setelah unit menyelesaikan tahap hari ini.
- [ ] A4. **Project Aktif** diurutkan dari deadline terdekat, dengan bar progres.
- [ ] A5. **Pengiriman Terakhir** dan **Stok License Key Tersedia** (angka < 50 berwarna oranye).
- [ ] A6. Dashboard memperbarui sendiri setiap 1 menit.

## B. Pelacakan garansi
- [ ] B1. Kotak **Cari / scan serial number** (di atas setiap halaman) bisa menerima: SN unit, SN kelengkapan, **atau SN komponen** (misalnya SN SSD) → membuka detail unit.
- [ ] B2. Detail unit menampilkan: client, vendor, produk, koli, surat jalan + ekspedisi + resi, tanggal kirim & diterima + penerima, instalasi, komponen + SN, aktivasi + key tersamar, kelengkapan, riwayat QC, foto, dan riwayat tahapan.

## C. Export
- [ ] C1. Detail project → **Export Excel** → file `<kode>-unit.xlsx` terunduh: satu baris per unit dengan kolom status, komponen, aktivasi (key tersamar), kelengkapan, QC terakhir, lot, koli, surat jalan, ekspedisi, resi, tanggal kirim/terima, penerima, dan kolom tambahan (kolom rahasia tidak ikut).

## Catatan temuan
| No | Poin | Temuan | Status |
|---|---|---|---|
| | | | |
