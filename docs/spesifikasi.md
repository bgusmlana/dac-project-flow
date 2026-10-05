# Spesifikasi Aplikasi Manajemen Project Produksi

> Status: **DRAFT — menunggu persetujuan**
> Tanggal: 29 September 2026

---

## 1. Ringkasan

Aplikasi web untuk melacak pekerjaan setiap project pengadaan perangkat IT (Laptop, AIO, Desktop, Mini PC, Server, Workstation, Interactive Flat Panel, dll.) mulai dari project dibuat sampai barang diterima client.

Tahapannya: **Project → Assembling → Aktivasi → QC → Packing → Ekspedisi** (dan opsional **Instalasi**).

Hal utama yang ingin dicapai:
- Progres setiap project bisa dilihat kapan saja (misalnya "Project A: 30.000 dari 50.000 unit sudah lolos QC").
- Setiap unit fisik tercatat riwayatnya: komponen apa yang terpasang, license key apa yang dipakai, siapa yang mengerjakan, kapan dikirim.
- Data bisa dicari untuk **klaim garansi**: cukup masukkan serial number, dan terlihat project, client, dan isi unitnya.
- Setiap divisi hanya mengelola pekerjaan dan user-nya sendiri.

## 2. Ruang Lingkup

| Fase | Isi |
|---|---|
| **Fase 1 (fokus)** | Aplikasi web. Scan barcode lewat scanner USB dan kamera HP melalui browser |
| Fase 2 (nanti) | Aplikasi Android untuk scan dan foto di lapangan (kemungkinan cukup PWA, yaitu web yang bisa di-install di HP) |

Skala: satu project bisa berisi **1 unit sampai 20.000–50.000 unit** (pernah sekali 120.000 unit).

---

## 3. Pengguna, Divisi & Hak Akses

### 3.1 Divisi
- Admin Project / Sales
- Assembling
- Aktivasi
- QC
- Packing
- Ekspedisi / Logistik

### 3.2 Role

| Role | Hak akses |
|---|---|
| **Super Admin** | Semua akses, termasuk pengaturan sistem dan master data |
| **Manager** | Melihat semua project dan divisi, laporan, serta membuat Leader |
| **Leader Divisi** | Menambah dan menonaktifkan user **di divisinya sendiri**, dan hanya melihat user divisinya. Tidak bisa membuat user dengan role setara atau lebih tinggi darinya |
| **Staff** | Input data hanya pada tahap divisinya (misalnya staf QC tidak bisa mengubah data assembling) |

Aturan tambahan:
- User **dinonaktifkan, bukan dihapus**, supaya riwayat pekerjaannya tetap ada.
- Semua perubahan data tercatat (**audit trail**): siapa, kapan, nilai lama, dan nilai baru.

---

## 4. Master Data

Data baku yang diisi sekali lalu dipilih lewat dropdown (mengurangi salah ketik):
- Client / Dinas / Instansi
- Supplier / Vendor / Prinsipal
- Katalog Produk (merek, tipe, part number, spesifikasi/SKU, jenis produk)
- **Jenis Produk** (lihat bagian 5)
- Kategori Komponen (Motherboard, CPU, RAM, SSD, HDD, PSU, GPU, RAID Card, NIC, Modul OPS, dll.)
- Jenis Aktivasi (Windows OEM/Retail/Volume, Windows Server + CAL, Office, dll.)
- Daftar Software
- Ekspedisi / Kurir

---

## 5. Jenis Produk Mengatur Alur Kerja

Setiap jenis produk punya pengaturan sendiri, sehingga jenis produk baru bisa ditambahkan tanpa mengubah program.

### 5.1 Tahapan per jenis produk (contoh awal, bisa diubah admin)

| Jenis | Assembling | Aktivasi | QC | Packing | Ekspedisi | Instalasi |
|---|---|---|---|---|---|---|
| Desktop / Workstation | Wajib | Wajib | Wajib | Wajib | Wajib | – |
| Server | Wajib (+ RAID/BIOS) | Wajib | Wajib | Wajib | Wajib | Opsional |
| Laptop / AIO | Opsional (upgrade RAM/SSD) | Wajib | Wajib | Wajib | Wajib | – |
| Mini PC | Opsional | Wajib | Wajib | Wajib | Wajib | – |
| Interactive Flat Panel | Opsional (pasang OPS) | Opsional | Wajib | Wajib | Wajib | Opsional |
| Aksesoris / lainnya | Dilewati | Dilewati | Opsional | Wajib | Wajib | – |

### 5.2 Yang diatur per jenis produk
- **Tahapan**: wajib, opsional, atau dilewati.
- **Kategori komponen** yang boleh dicatat saat assembling.
- **Template checklist QC**. Contoh:
  - Laptop: baterai/charging, keyboard, touchpad, webcam, layar (dead pixel), WiFi/Bluetooth
  - Server: POST, status RAID, IPMI/iDRAC/iLO, PSU redundan, burn-in test
  - IFP: sentuhan di semua titik layar, speaker, HDMI in/out, OPS menyala, dead pixel
  - Desktop/Workstation: stress test, suhu, semua port, GPU
- **Jenis aktivasi** yang berlaku.
- **Kolom tambahan khusus**. Contoh: Server (hostname, IP IPMI, konfigurasi RAID, password iDRAC terenkripsi), IFP (ukuran layar, versi firmware), Laptop (SN charger).

### 5.3 Produk bundel
Produk yang terdiri dari beberapa bagian (misalnya IFP = panel + OPS + stand + remote, atau Desktop = CPU + monitor) dicatat sebagai **unit utama** dengan **kelengkapan** yang masing-masing punya SN. Saat packing, sistem mengecek apakah semua kelengkapan sudah masuk.

---

## 6. Alur Kerja

### 6.1 Struktur data

```
PROJECT
 └─ ITEM PRODUK (produk dari katalog, vendor, jumlah)
     └─ UNIT (satu baris per barang fisik, punya Serial Number)
         ├─ Komponen (hasil assembling)
         ├─ Aktivasi (OS & software + key)
         ├─ QC
         ├─ Packing (masuk ke koli/dus)
         └─ Pengiriman (koli masuk ke pengiriman)
```

### 6.2 Status unit

```
Terdaftar → Assembling → Aktivasi → QC → Siap Packing → Packed → Dikirim → Diterima → (Terinstal)
                ↑           ↑       │
                └───────────┴───────┘  QC gagal = rework (alasan wajib diisi)
```

- Unit hanya bisa pindah ke tahap berikutnya kalau tahap wajib sebelumnya sudah selesai. Tahap yang dilewati untuk jenis produk tersebut otomatis dilompati.
- **Pengiriman parsial** didukung: satu project bisa dikirim dalam beberapa gelombang.

### 6.3 Data per tahap

**Project**
- ID Project (otomatis, misalnya `PRJ-2026-0001`)
- Nama project, Client/Dinas/Instansi
- No. PO / Kontrak / SPK
- Tanggal target / deadline, PIC, alamat pengiriman
- Mode QC (per unit atau sampling, lihat bagian 7)
- Item produk (bisa lebih dari satu): produk dari katalog (merek, tipe, part number, spesifikasi/SKU), vendor/prinsipal, jumlah

**Assembling**
- Kategori komponen, merek & tipe, serial number komponen
- Teknisi dan waktu (terisi otomatis)

**Aktivasi**
- Jenis aktivasi dan license key
- Software: nama, versi, license key
- Status (berhasil/gagal), tanggal aktivasi, masa lisensi (kalau berlangganan)

**QC**
- Checklist sesuai template jenis produk (Pass/Fail per poin)
- Hasil akhir, catatan, dan foto dokumentasi

**Packing**
- No. koli/dus, berat, isi (unit apa saja, diisi lewat scan)
- Foto dokumentasi, packing list

**Ekspedisi / Logistik**
- Ekspedisi, no. resi, no. surat jalan, tanggal kirim
- Koli yang dikirim
- Bukti terima / BAST (foto + nama penerima), tanggal diterima
- Foto dokumentasi

**Instalasi (opsional, untuk Server/IFP)**
- Tanggal, teknisi, lokasi, foto, BAST instalasi

---

## 7. Operasi Massal (untuk Project Besar)

Menginput 20.000–50.000 unit satu per satu tidak realistis, jadi sistem menyediakan:

1. **Import SN dari Excel.** Daftar SN dari vendor di-upload, lalu unit dibuat otomatis. Sistem melaporkan baris yang gagal (misalnya SN duplikat).
2. **Import license key massal.** Key di-upload sekaligus, lalu dibagikan otomatis ke unit.
3. **Scan untuk perpindahan status.** Scan SN unit atau barcode dus, dan status banyak unit berubah sekaligus.
4. **QC sampling per lot** (dipilih saat project dibuat):
   - **Per unit**: setiap unit di-QC. Cocok untuk project kecil dan Server/Workstation.
   - **Sampling**: unit dibagi per **lot** (misalnya 500 unit), lalu hanya **sampel** yang di-QC (misalnya 5–10%). Kalau sampel gagal melebihi batas, seluruh lot ditahan untuk diperiksa.
5. **Dokumentasi per koli/pengiriman**, bukan per unit, untuk project besar.
6. **Cetak label barcode** untuk unit dan koli.

Import dan export besar diproses di latar belakang, sehingga user tidak perlu menunggu dan bisa melihat progresnya.

---

## 8. Dokumentasi Foto

- Foto diambil dari kamera HP (lewat browser) atau di-upload.
- Dikompres otomatis dan diberi **watermark** (tanggal, jam, ID unit/koli, nama petugas) supaya sah sebagai bukti.
- Disimpan di penyimpanan file terpisah dari database.

---

## 9. Keamanan

- **License key disimpan terenkripsi.** Tampilannya disamarkan (`XXXXX-XXXXX-…-AB12C`) kecuali untuk role yang diizinkan, dan **setiap kali key dilihat atau disalin, tercatat**.
- Satu license key tidak bisa dipakai di dua unit.
- Serial number unit dan komponen tidak boleh duplikat.
- Password perangkat (misalnya iDRAC server) juga disimpan terenkripsi.
- Login dengan session, password di-hash, dan aplikasi diakses lewat HTTPS.
- Backup database dan foto dilakukan otomatis setiap hari.

---

## 10. Laporan & Fitur Tambahan

- **Dashboard**: progres per project per tahap, project mendekati deadline, dan tahap yang menjadi bottleneck.
- **Pelacakan garansi**: cari berdasarkan SN unit atau SN komponen, lalu tampil project, client, tanggal kirim, komponen, dan license key-nya.
- **Export dokumen**: packing list, surat jalan, laporan serah terima, dan laporan project (PDF/Excel).
- **Riwayat unit**: timeline lengkap satu unit dari terdaftar sampai diterima, termasuk rework.

---

## 11. Teknologi

Aplikasi akan dikerjakan dengan bantuan AI. Teknologi dipilih karena **ringan, populer (sehingga AI menulisnya dengan akurat), memakai satu bahasa (TypeScript)**, dan mudah di-deploy.

| Bagian | Teknologi | Fungsi |
|---|---|---|
| Backend API | Fastify (Node.js + TypeScript) | Server aplikasi, ringan dan cepat |
| Database | MySQL 8 | Penyimpanan data |
| ORM | Drizzle | Akses database dari kode |
| Validasi | Zod | Aturan validasi input |
| Login & role | Better Auth | Login, session, dan manajemen user |
| Frontend | React + Vite + shadcn/ui + TanStack Table | Tampilan web |
| Antrian proses | BullMQ + Redis | Import/export besar dan kompres foto di latar belakang |
| Penyimpanan foto | MinIO + sharp | Penyimpanan dan kompresi foto |
| Deploy | Docker Compose + Nginx + HTTPS (Let's Encrypt) | Menjalankan semuanya di server dengan satu perintah |

**Kebutuhan server (awal):** VPS Linux (Ubuntu) dengan 4 vCPU, 8 GB RAM, dan SSD mulai 200 GB (bisa ditambah sesuai jumlah foto).

Aplikasi dibangun dengan API terpisah sejak awal, sehingga aplikasi Android nanti bisa memakai API yang sama.

---

## 12. Tahapan Pengerjaan

| Tahap | Isi |
|---|---|
| 0 | Fondasi: struktur project, Docker, database, login, role & divisi, manajemen user, audit trail |
| 1 | Master data + Jenis Produk (tahapan, komponen, template QC, jenis aktivasi, kolom tambahan) |
| 2 | Project + Item Produk + Unit (termasuk import SN dari Excel) |
| 3 | Assembling |
| 4 | Aktivasi + manajemen license key (import massal, enkripsi) |
| 5 | QC (per unit & sampling per lot) + foto |
| 6 | Packing (koli, scan, label, packing list) |
| 7 | Ekspedisi (pengiriman parsial, surat jalan, BAST) + Instalasi |
| 8 | Dashboard, laporan, pelacakan garansi, export |
| 9 | Deploy ke server, backup, uji coba dengan data nyata |
| Fase 2 | Aplikasi Android / PWA |

Setiap tahap diuji dan dicoba sebelum lanjut ke tahap berikutnya.

---

## 13. Hal yang Perlu Diputuskan

1. **Server:** sewa VPS (cloud) atau server fisik di kantor?
2. **Daftar divisi:** apakah sudah sesuai bagian 3.1? Ada divisi lain?
3. **Akses license key:** role mana saja yang boleh melihat key secara utuh?
4. **QC sampling:** apakah boleh untuk project besar? Berapa ukuran lot dan persentase sampel standarnya?
5. **Tahap Instalasi:** apakah perusahaan juga mengerjakan instalasi di lokasi client?
6. **Format ID Project:** apakah `PRJ-2026-0001` sudah cocok, atau ada format internal yang sudah dipakai?
7. **Dokumen resmi:** format surat jalan, packing list, dan BAST apakah mengikuti template perusahaan yang sudah ada?
8. **Lama penyimpanan foto:** berapa lama foto dokumentasi harus disimpan (misalnya selama masa garansi)?
9. **Data lama:** apakah ada data project sebelumnya (Excel) yang perlu dipindahkan ke sistem?
10. **Target waktu:** kapan aplikasi ditargetkan mulai dipakai?
