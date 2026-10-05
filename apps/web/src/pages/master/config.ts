import { ACTIVATION_KIND_LABELS, CLIENT_TYPE_LABELS, VENDOR_TYPE_LABELS, type MasterKind } from '@manpro/shared';

export interface MasterField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'email' | 'tel';
  options?: Record<string, string>;
  required?: boolean;
  /** Tampil sebagai kolom di tabel. */
  inTable?: boolean;
}

export interface MasterConfig {
  title: string;
  description: string;
  /** Kata benda tunggal untuk tombol & dialog, misalnya "Client". */
  noun: string;
  fields: MasterField[];
}

const nameField = (label = 'Nama'): MasterField => ({ key: 'name', label, type: 'text', required: true, inTable: true });

export const MASTER_CONFIG: Record<MasterKind, MasterConfig> = {
  clients: {
    title: 'Client',
    description: 'Dinas, instansi, atau perusahaan pemesan.',
    noun: 'Client',
    fields: [
      nameField(),
      { key: 'type', label: 'Jenis', type: 'select', options: CLIENT_TYPE_LABELS, required: true, inTable: true },
      { key: 'contactName', label: 'Nama kontak', type: 'text', inTable: true },
      { key: 'phone', label: 'Telepon', type: 'tel', inTable: true },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Alamat', type: 'textarea' },
    ],
  },
  vendors: {
    title: 'Vendor',
    description: 'Supplier, vendor, atau prinsipal asal barang.',
    noun: 'Vendor',
    fields: [
      nameField(),
      { key: 'type', label: 'Jenis', type: 'select', options: VENDOR_TYPE_LABELS, required: true, inTable: true },
      { key: 'contactName', label: 'Nama kontak', type: 'text', inTable: true },
      { key: 'phone', label: 'Telepon', type: 'tel', inTable: true },
      { key: 'email', label: 'Email', type: 'email' },
    ],
  },
  couriers: {
    title: 'Ekspedisi',
    description: 'Jasa pengiriman yang dipakai divisi Logistik.',
    noun: 'Ekspedisi',
    fields: [nameField()],
  },
  'component-categories': {
    title: 'Kategori Komponen',
    description: 'Jenis komponen yang dicatat saat assembling (Motherboard, RAM, SSD, dll.).',
    noun: 'Kategori',
    fields: [nameField()],
  },
  'activation-types': {
    title: 'Jenis Aktivasi',
    description: 'Lisensi yang diaktivasi pada unit (Windows, Office, dll.).',
    noun: 'Jenis Aktivasi',
    fields: [nameField(), { key: 'kind', label: 'Kelompok', type: 'select', options: ACTIVATION_KIND_LABELS, required: true, inTable: true }],
  },
  software: {
    title: 'Software',
    description: 'Daftar software yang dipasang pada unit.',
    noun: 'Software',
    fields: [nameField(), { key: 'publisher', label: 'Penerbit', type: 'text', inTable: true }],
  },
};
