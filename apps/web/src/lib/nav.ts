import {
  canAccessUserManagement,
  canViewActivityLogs,
  canConfigureProductTypes,
  canManageLicenseKeys,
  canManageMasterData,
  canManageProjects,
  canWorkStage,
  STAGE_LABELS,
  STAGES,
  type MeDto,
  type Stage,
} from '@manpro/shared';
import {
  AppWindow,
  BadgeCheck,
  Building2,
  Cpu,
  Factory,
  FolderKanban,
  History,
  KeyRound,
  KeySquare,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Package,
  ScrollText,
  PackageCheck,
  Settings2,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const STAGE_ICONS: Record<Stage, LucideIcon> = {
  assembling: Wrench,
  activation: KeyRound,
  qc: BadgeCheck,
  packing: PackageCheck,
  shipping: Truck,
  installation: MapPin,
};

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

/** Super Admin & Manager melihat semua menu. */
function isTop(me: MeDto) {
  return me.role === 'super_admin' || me.role === 'manager';
}

/** Tahap yang menjadi pekerjaan user ini (kosong untuk Admin Project). */
export function myStages(me: MeDto): Stage[] {
  return STAGES.filter((s) => canWorkStage(me, s));
}

/**
 * Menu samping sesuai role & divisi. Hanya menu yang berhubungan dengan pekerjaan user yang tampil:
 * misalnya staff QC hanya melihat Beranda, Lini QC, dan Pusat Bantuan.
 */
export function navGroups(me: MeDto): NavGroup[] {
  const top = isTop(me);
  const groups: NavGroup[] = [
    {
      title: null,
      items: [
        { to: '/', label: 'Beranda', icon: LayoutDashboard },
        ...(canManageProjects(me) ? [{ to: '/projects', label: 'Project', icon: FolderKanban }] : []),
      ],
    },
    {
      title: top ? 'Lini Produksi' : 'Pekerjaan Saya',
      items: myStages(me).map((s) => ({ to: `/work/${s}`, label: `Lini ${STAGE_LABELS[s]}`, icon: STAGE_ICONS[s] })),
    },
    {
      title: 'Lisensi',
      items: canManageLicenseKeys(me) ? [{ to: '/license-keys', label: 'License Key', icon: KeySquare }] : [],
    },
    {
      title: 'Riwayat',
      items: [
        { to: '/history', label: 'Riwayat Pekerjaan', icon: History },
        ...(canViewActivityLogs(me) ? [{ to: '/activity-logs', label: 'Log Aktivitas', icon: ScrollText }] : []),
      ],
    },
    {
      title: 'Master Data',
      items: canManageMasterData(me)
        ? [
            { to: '/master/clients', label: 'Client', icon: Building2 },
            { to: '/master/vendors', label: 'Vendor', icon: Factory },
            { to: '/master/products', label: 'Katalog Produk', icon: Package },
            ...(canConfigureProductTypes(me) ? [{ to: '/master/product-types', label: 'Jenis Produk', icon: Settings2 }] : []),
            { to: '/master/component-categories', label: 'Kategori Komponen', icon: Cpu },
            { to: '/master/activation-types', label: 'Jenis Aktivasi', icon: KeyRound },
            { to: '/master/software', label: 'Software', icon: AppWindow },
            { to: '/master/couriers', label: 'Ekspedisi', icon: Truck },
          ]
        : [],
    },
    {
      title: 'Pengaturan',
      items: canAccessUserManagement(me) ? [{ to: '/users', label: me.role === 'leader' ? 'User Divisi Saya' : 'User', icon: Users }] : [],
    },
    { title: 'Bantuan', items: [{ to: '/help', label: 'Pusat Bantuan', icon: LifeBuoy }] },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/**
 * Halaman yang tidak boleh dibuka lewat alamat langsung oleh user yang tidak berhak.
 * Halaman detail (project, unit) tetap bisa dibuka dari tautan karena berguna untuk dilihat.
 */
export function canOpenPath(me: MeDto, path: string): boolean {
  if (path.startsWith('/master/product-types')) return canConfigureProductTypes(me);
  if (path.startsWith('/master')) return canManageMasterData(me);
  if (path.startsWith('/users')) return canAccessUserManagement(me);
  if (path.startsWith('/license-keys')) return canManageLicenseKeys(me);
  if (path.startsWith('/activity-logs')) return canViewActivityLogs(me);
  return true;
}
