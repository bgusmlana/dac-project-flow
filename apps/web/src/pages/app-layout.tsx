import type { MeDto } from '@manpro/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes, CircleHelp, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { SnSearch } from '@/components/sn-search';
import { UserMenu } from '@/components/user-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useMe } from '@/hooks/use-me';
import { authClient } from '@/lib/auth-client';
import { canOpenPath, navGroups } from '@/lib/nav';
import { cn } from '@/lib/utils';

function Sidebar({ me }: { me: MeDto }) {
  const groups = navGroups(me);
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent/60">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Boxes className="size-4.5" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Manajemen Project</span>
          <span className="block text-[11px] text-sidebar-foreground/60">Produksi Perangkat IT</span>
        </span>
      </Link>

      {/* Menu punya scroll sendiri, terpisah dari isi halaman. */}
      <nav className="scrollbar-thin scrollbar-sidebar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.title ?? 'main'} className="mb-3">
            {g.title && <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">{g.title}</div>}
            <div className="grid gap-0.5">
              {g.items.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  end={m.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isActive && 'bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
                    )
                  }
                >
                  <m.icon className="size-4 shrink-0" />
                  <span className="truncate">{m.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function AppLayout() {
  const { data: me, isLoading, isError, refetch, isFetching } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  // Tutup menu HP setiap pindah halaman.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (isLoading) return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Memuat…</div>;
  // Server tidak bisa dihubungi (bukan belum login): jangan lempar ke halaman login.
  if (isError)
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="font-medium">Tidak bisa terhubung ke server.</p>
        <p className="text-sm text-muted-foreground">Periksa koneksi internet Anda, lalu coba lagi.</p>
        <Button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Menghubungkan…' : 'Coba lagi'}
        </Button>
      </div>
    );
  if (!me) return <Navigate to="/login" replace />;
  if (!canOpenPath(me, location.pathname)) return <Navigate to="/" replace />;

  async function logout() {
    await authClient.signOut();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Menu samping (layar lebar) */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
        <Sidebar me={me} />
      </aside>

      {/* Menu laci (HP) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">
            <Sidebar me={me} />
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 text-sidebar-foreground" tooltip="Tutup menu" onClick={() => setMenuOpen(false)}>
              <X />
            </Button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" tooltip="Buka menu" onClick={() => setMenuOpen(true)}>
            <Menu />
          </Button>
          <SnSearch />
          <Tip label="Pusat Bantuan: alur kerja & panduan" side="bottom">
            <Link to="/help" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto')}>
              <CircleHelp /> <span className="hidden lg:inline">Bantuan</span>
            </Link>
          </Tip>
          <div className="h-6 w-px bg-border" />
          <UserMenu me={me} onLogout={logout} />
        </header>
        {/* Isi halaman punya scroll sendiri; menu samping tidak ikut bergulir. */}
        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
