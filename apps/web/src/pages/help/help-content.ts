import type { MeDto } from '@manpro/shared';
import { canManageLicenseKeys, canManageProjects, canWorkStage } from '@manpro/shared';

/** Satu langkah di diagram alur kerja. */
export interface FlowStep {
  id: string;
  title: string;
  who: string;
  does: string;
  result: string;
  optional?: boolean;
}

export const FLOW: FlowStep[] = [
  {
    id: 'project',
    title: 'Project',
    who: 'Admin Project',
    does: 'Buat project, tambah item produk, daftarkan serial number unit (scan atau import Excel).',
    result: 'Unit masuk antrian tahap pertama.',
  },
  {
    id: 'assembling',
    title: 'Assembling',
    who: 'Divisi Assembling',
    does: 'Pasang komponen dan catat kategori, merek/tipe, serta SN tiap komponen.',
    result: 'Unit pindah ke Aktivasi.',
  },
  {
    id: 'activation',
    title: 'Aktivasi',
    who: 'Divisi Aktivasi',
    does: 'Aktivasi OS/software dan catat license key-nya (per unit atau massal).',
    result: 'Unit pindah ke QC.',
  },
  {
    id: 'qc',
    title: 'QC',
    who: 'Divisi QC',
    does: 'Periksa unit sesuai checklist dan ambil foto. Unit gagal dikembalikan (rework).',
    result: 'Lulus → Packing. Gagal → kembali ke Assembling/Aktivasi.',
  },
  {
    id: 'packing',
    title: 'Packing',
    who: 'Divisi Packing',
    does: 'Buat koli/dus, scan unit ke dalamnya, foto, lalu segel. Cetak label & packing list.',
    result: 'Koli tersegel masuk antrian Ekspedisi.',
  },
  {
    id: 'shipping',
    title: 'Ekspedisi',
    who: 'Divisi Logistik',
    does: 'Buat pengiriman, scan koli, isi ekspedisi & resi, cetak surat jalan, konfirmasi diterima + BAST.',
    result: 'Unit selesai, atau lanjut ke Instalasi.',
  },
  {
    id: 'installation',
    title: 'Instalasi',
    who: 'Divisi Logistik',
    does: 'Pasang unit di lokasi client, catat lokasi, dan unggah foto instalasi.',
    result: 'Unit selesai.',
    optional: true,
  },
];

export interface Guide {
  id: string;
  title: string;
  who: string;
  /** Apakah panduan ini termasuk pekerjaan user tersebut? */
  isMine: (me: MeDto) => boolean;
  steps: string[];
  tips?: string[];
}

const top = (me: MeDto) => me.role === 'super_admin' || me.role === 'manager';

export const GUIDES: Guide[] = [
  {
    id: 'project',
    title: 'Membuat project & mendaftarkan unit',
    who: 'Admin Project, Manager',
    isMine: (me) => canManageProjects(me),
    steps: [
      'Buka menu **Project** → **Project Baru**. Isi nama, client, nomor PO, deadline, dan PIC. Kode project dibuat otomatis.',
      'Pilih **Mode QC**: *Per unit* (setiap unit diperiksa) atau *Sampling* (diperiksa per lot, isi ukuran lot, persen sampel, dan batas gagal).',
      'Di halaman detail project → **Tambah Item** → cari produk dari katalog, pilih vendor, isi jumlah. Centang tahap opsional yang dipakai (misalnya Assembling untuk laptop yang di-upgrade). Isi juga **kelengkapan** (charger, keyboard, dll.) kalau ada.',
      'Daftarkan serial number unit: **Tambah / Scan Unit** untuk sedikit unit (scan barcode satu per satu atau tempel dari Excel), atau **Import Excel** untuk ribuan unit (unduh templatenya dulu).',
      'Begitu unit terdaftar, status project berubah menjadi **Berjalan** dan unit otomatis masuk antrian tahap pertamanya.',
      'Pantau progres di halaman detail project dan di **Beranda**. Setelah semua unit selesai, project otomatis berstatus **Selesai**.',
    ],
    tips: [
      'Produk belum ada di katalog? Tambahkan dulu di **Master Data → Katalog Produk**. Client/vendor baru juga lewat Master Data.',
      'Unit yang salah input bisa dihapus dari halaman detail unit selama belum diproses.',
      'Import Excel berjalan di latar belakang. Dialog boleh ditutup; hasilnya tetap terlihat di **Riwayat Import**.',
    ],
  },
  {
    id: 'assembling',
    title: 'Lini Assembling',
    who: 'Divisi Assembling',
    isMine: (me) => canWorkStage(me, 'assembling'),
    steps: [
      'Buka **Lini Assembling**. Tabel antrian berisi unit yang menunggu dirakit.',
      'Scan serial number unit di kotak scan (atau klik SN di tabel antrian) → panel unit terbuka.',
      'Untuk setiap komponen yang dipasang: pilih **kategori**, isi merek & tipe, scan **SN komponen** → **Tambah**.',
      'Setelah semua komponen tercatat → **Selesai Assembling**. Unit pindah ke Aktivasi dan kotak scan siap untuk unit berikutnya.',
    ],
    tips: [
      'Merek & tipe tidak dikosongkan setelah Tambah, jadi unit berikutnya yang sejenis lebih cepat.',
      'SN komponen yang sudah terpasang di unit lain akan ditolak.',
      'Setelah unit keluar dari Assembling, komponennya tidak bisa diubah lagi. Kalau ada kesalahan, minta QC mengembalikan unit (rework).',
    ],
  },
  {
    id: 'activation',
    title: 'Lini Aktivasi',
    who: 'Divisi Aktivasi',
    isMine: (me) => canWorkStage(me, 'activation'),
    steps: [
      'Buka **Lini Aktivasi** → scan serial number unit.',
      'Pilih jenis aktivasi (misalnya Windows 11 Pro) dan software-nya, lalu pilih cara mengisi key: **Ambil key dari stok** (otomatis), **Ketik / scan key**, atau **Tanpa key** (lisensi digital).',
      'Kalau aktivasi gagal, centang **Aktivasi gagal** dan tulis catatannya.',
      'Setelah minimal satu aktivasi berhasil → **Selesai Aktivasi**. Unit pindah ke QC.',
      'Untuk project besar: pilih project di filter antrian → **Aktivasi Massal** → pilih jenis, jumlah unit, centang ambil key & langsung selesaikan → **Jalankan**.',
    ],
    tips: [
      'Aktivasi massal bersifat "semua atau tidak sama sekali": kalau stok key kurang, tidak ada unit yang diproses.',
      'Menghapus aktivasi mengembalikan key-nya ke stok.',
    ],
  },
  {
    id: 'license-keys',
    title: 'Mengelola stok License Key',
    who: 'Divisi Aktivasi, Manager',
    isMine: (me) => canManageLicenseKeys(me),
    steps: [
      'Buka menu **License Key** → **Import Key** → pilih jenis, lalu tempel key (satu per baris) atau pilih file .txt.',
      'Tabel **Stok** menunjukkan jumlah key per status: Tersedia, Teraktivasi, Dicabut, dst.',
      'Untuk menyiapkan key khusus satu project → **Alokasi ke Project**. Saat aktivasi, key alokasi project dipakai lebih dulu.',
      'Key yang bermasalah bisa **Dicabut**, dan bisa dikembalikan ke stok lagi.',
    ],
    tips: [
      'Key selalu tampil tersamar. Klik ikon mata untuk melihat key utuh; setiap kali dilihat akan tercatat.',
      'Key yang sama tidak bisa diimport dua kali (dianggap sama walaupun beda huruf besar/kecil atau spasi).',
    ],
  },
  {
    id: 'qc',
    title: 'Lini QC',
    who: 'Divisi QC',
    isMine: (me) => canWorkStage(me, 'qc'),
    steps: [
      'Buka **Lini QC** → scan serial number unit → checklist QC sesuai jenis produknya tampil.',
      'Tandai setiap poin **Lulus** atau **Gagal** (tombol **Tandai semua lulus** untuk mempercepat). Ambil foto dengan **Ambil / Upload Foto**.',
      'Semua lulus → **Simpan: LULUS QC**. Unit pindah ke Packing.',
      'Ada yang gagal → tulis catatan (wajib) dan pilih tujuan: kembali ke **Assembling**/**Aktivasi** untuk diperbaiki, atau **Tetap di QC** untuk dicek ulang.',
    ],
    tips: [
      'Project dengan **Mode QC Sampling**: pilih project di filter antrian → **Bentuk Lot Baru**. Hanya unit sampel yang discan dan diperiksa. Kalau semua sampel lulus, seluruh unit lot pindah ke Packing.',
      'Kalau sampel gagal melebihi batas, lot **Ditahan**. Leader QC atau Manager yang memutuskan: loloskan lot (dengan alasan) atau kembalikan seluruh lot.',
      'Foto otomatis diberi watermark tanggal, jam, SN, dan nama petugas.',
    ],
  },
  {
    id: 'packing',
    title: 'Lini Packing',
    who: 'Divisi Packing',
    isMine: (me) => canWorkStage(me, 'packing'),
    steps: [
      'Buka **Lini Packing** → pilih project di filter antrian → panel **Koli / Dus** tampil.',
      'Klik **Koli Baru**. Kode koli dibuat otomatis (misalnya PRJ-2026-0001-K0001).',
      'Scan serial number unit yang dimasukkan ke dus. Bisa banyak sekaligus.',
      'Unggah foto packing, isi berat kalau perlu → **Segel Koli**. Unit di dalamnya pindah ke antrian Ekspedisi.',
      'Klik **Label & Packing List** untuk mencetak label dus (dengan barcode) dan daftar isinya.',
    ],
    tips: [
      'Unit yang kelengkapannya belum lengkap (misalnya charger belum dicatat) akan ditolak masuk koli.',
      'Salah segel? **Buka segel** masih bisa selama koli belum masuk pengiriman.',
    ],
  },
  {
    id: 'shipping',
    title: 'Lini Ekspedisi (pengiriman)',
    who: 'Divisi Logistik',
    isMine: (me) => canWorkStage(me, 'shipping'),
    steps: [
      'Buka **Lini Ekspedisi** → pilih project → **Pengiriman Baru**. Nomor surat jalan dibuat otomatis.',
      'Scan kode koli (label di dus) yang akan dikirim.',
      'Pilih ekspedisi, isi nomor resi & kendaraan → **Kirim**. Status menjadi **Dalam perjalanan**.',
      'Cetak **Surat Jalan** untuk dibawa bersama barang.',
      'Setelah barang sampai: isi nama penerima → **Konfirmasi Diterima**, lalu unggah foto dan scan BAST.',
    ],
    tips: [
      'Satu project boleh dikirim bertahap (beberapa pengiriman).',
      'Hanya koli yang sudah disegel yang bisa dimasukkan ke pengiriman.',
    ],
  },
  {
    id: 'installation',
    title: 'Lini Instalasi',
    who: 'Divisi Logistik',
    isMine: (me) => canWorkStage(me, 'installation'),
    steps: [
      'Hanya untuk produk yang memakai tahap Instalasi (misalnya IFP atau Server).',
      'Buka **Lini Instalasi** → isi lokasi pemasangan → scan serial number unit (bisa beberapa) → **Selesai Instalasi**.',
      'Unggah foto instalasi di halaman detail unit.',
    ],
  },
  {
    id: 'history',
    title: 'Melihat riwayat pekerjaan',
    who: 'Semua user',
    isMine: () => true,
    steps: [
      'Buka menu **Riwayat Pekerjaan**. Staff melihat pekerjaannya sendiri, Leader melihat pekerjaan seluruh anggota divisinya, dan Manager melihat semua divisi.',
      'Pilih rentang tanggal (**Hari ini**, **7 hari**, **30 hari**, **Bulan ini**, atau tanggal sendiri). Saring juga berdasarkan petugas, project, tahap, hasil, atau serial number.',
      'Tab **Rekap per Petugas** menampilkan jumlah pekerjaan tiap orang: tahap selesai, lulus QC, gagal/rework, dan unit yang didaftarkan. Klik nama petugas untuk melihat daftar pekerjaannya.',
      'Tab **Daftar Riwayat** berisi setiap pekerjaan: waktu, SN unit, project, tahap, hasil, petugas, dan catatan.',
      'Klik **Export Excel** untuk mengunduh rekap dan daftar sesuai filter.',
    ],
    tips: [
      'Manager & Super Admin juga punya menu **Log Aktivitas**: semua perubahan data (tambah, ubah, hapus, ganti password, dll.) beserta nilai sebelum dan sesudahnya.',
    ],
  },
  {
    id: 'leader',
    title: 'Tugas Leader Divisi',
    who: 'Leader Divisi',
    isMine: (me) => me.role === 'leader',
    steps: [
      'Menu **User Divisi Saya**: tambah akun untuk staff di divisi Anda, reset password, atau nonaktifkan staff yang keluar.',
      'Menu **Riwayat Pekerjaan**: pantau jumlah pekerjaan dan hasil kerja tiap staff per hari, lalu export ke Excel untuk laporan.',
      'Anda hanya melihat dan mengelola user di divisi sendiri, dan hanya bisa membuat akun Staff.',
      'Leader QC juga memutuskan lot QC yang **Ditahan** (lihat panduan Lini QC).',
    ],
  },
  {
    id: 'manager',
    title: 'Pengaturan untuk Manager / Super Admin',
    who: 'Manager, Super Admin',
    isMine: top,
    steps: [
      '**Master Data → Jenis Produk**: atur tahap mana yang wajib, opsional, atau dilewati untuk tiap jenis produk (misalnya Laptop tanpa Assembling), kategori komponen, jenis aktivasi, checklist QC, dan kolom tambahan.',
      '**Master Data** lain: client, vendor, katalog produk, software, dan ekspedisi.',
      '**User**: buat akun Manager, Leader, dan Staff untuk setiap divisi.',
      '**Beranda**: pantau antrian per tahap (tahap dengan antrian terbanyak adalah titik macet), deadline, dan stok license key.',
    ],
  },
];

export const TERMS: { term: string; meaning: string }[] = [
  { term: 'Project', meaning: 'Satu pesanan / pengadaan dari client, biasanya satu nomor PO.' },
  { term: 'Item', meaning: 'Satu jenis produk di dalam project beserta jumlahnya (misalnya 500 laptop merek X tipe Y).' },
  { term: 'Unit', meaning: 'Satu perangkat fisik, dikenali dari serial number (SN)-nya.' },
  { term: 'Jenis Produk', meaning: 'Laptop, AIO, Server, IFP, dll. Menentukan tahap yang dilalui unit dan checklist QC-nya.' },
  { term: 'Lini produksi', meaning: 'Halaman kerja tiap divisi. Isinya antrian unit di tahap tersebut dan kotak scan.' },
  { term: 'Antrian', meaning: 'Unit yang sedang menunggu atau sedang dikerjakan di suatu tahap.' },
  { term: 'Kelengkapan', meaning: 'Barang yang ikut dengan unit: charger, keyboard, mouse, remote, dll.' },
  { term: 'Rework', meaning: 'Unit yang gagal QC dikembalikan ke tahap sebelumnya untuk diperbaiki.' },
  { term: 'Lot', meaning: 'Kelompok unit untuk QC sampling. Hanya sebagian (sampel) yang diperiksa.' },
  { term: 'Koli', meaning: 'Satu dus/kemasan berisi satu atau beberapa unit, punya kode dan label sendiri.' },
  { term: 'Surat Jalan', meaning: 'Dokumen pengiriman berisi daftar koli, tujuan, dan ekspedisi.' },
  { term: 'BAST', meaning: 'Berita Acara Serah Terima: bukti barang sudah diterima client.' },
  { term: 'License key', meaning: 'Kode lisensi OS/software. Disimpan terenkripsi dan selalu tampil tersamar.' },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Saat scan muncul "sedang di tahap …, bukan …". Kenapa?',
    a: 'Unit itu belum sampai ke tahap Anda, atau sudah lewat. Cek posisinya lewat kotak **Cari / scan serial number** di bagian atas halaman. Detail unit menampilkan tahap sekarang dan riwayatnya.',
  },
  {
    q: 'Serial number tidak ditemukan.',
    a: 'Pastikan unit sudah didaftarkan oleh Admin Project. Pencarian juga menerima SN kelengkapan dan SN komponen (misalnya SN SSD).',
  },
  {
    q: 'Tombol "Selesai" tidak bisa diklik.',
    a: 'Data wajib di tahap itu belum lengkap. Assembling: minimal satu komponen. Aktivasi: minimal satu aktivasi berhasil. QC: semua poin wajib terisi.',
  },
  {
    q: 'Kenapa ada tahap yang dilewati?',
    a: 'Tahap yang dilalui ditentukan oleh Jenis Produk dan pilihan saat item dibuat. Contohnya, laptop biasanya langsung ke Aktivasi tanpa Assembling, dan Instalasi hanya untuk produk tertentu.',
  },
  {
    q: 'Saya salah memasukkan data di tahap yang sudah selesai.',
    a: 'Minta divisi QC mengembalikan unit (rework) ke tahap Anda, atau hubungi Leader/Manager.',
  },
  {
    q: 'Saya lupa password.',
    a: 'Hubungi Leader divisi Anda. Leader bisa me-reset password lewat menu User.',
  },
  {
    q: 'Menu yang saya butuhkan tidak ada.',
    a: 'Menu hanya menampilkan pekerjaan divisi Anda. Kalau Anda perlu akses tambahan, minta Leader atau Manager mengubah divisi/role akun Anda.',
  },
  {
    q: 'Di mana saya melihat berapa unit yang sudah saya kerjakan?',
    a: 'Buka menu **Riwayat Pekerjaan**. Pilih rentang tanggal, lalu lihat tab **Rekap**. Leader bisa melihat rekap seluruh anggota divisinya.',
  },
  {
    q: 'Bagaimana melacak unit untuk klaim garansi?',
    a: 'Ketik atau scan SN unit, SN kelengkapan, atau SN komponen di kotak cari atas. Detail unit menampilkan client, komponen, aktivasi, hasil QC, koli, surat jalan, resi, tanggal kirim & terima, dan foto.',
  },
];
