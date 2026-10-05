import { ROLE_LABELS, type MeDto } from '@manpro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground', className)}>
      {initials(name)}
    </span>
  );
}

/** Menu user di pojok kanan atas: profil, ganti password, keluar. */
export function UserMenu({ me, onLogout }: { me: MeDto; onLogout: () => void }) {
  const [dialog, setDialog] = useState<'profile' | 'password' | null>(null);
  const roleLine = `${ROLE_LABELS[me.role]}${me.divisionName ? ` · ${me.divisionName}` : ''}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted" />
          }
        >
          <Avatar name={me.name} />
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-40 truncate text-sm font-medium">{me.name}</span>
            <span className="block max-w-40 truncate text-xs text-muted-foreground">{roleLine}</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2">
              <Avatar name={me.name} className="size-9" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium text-foreground">{me.name}</span>
                <span className="block truncate text-xs font-normal">@{me.username}</span>
                <span className="block truncate text-xs font-normal">{roleLine}</span>
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="px-2 py-1.5" onClick={() => setDialog('profile')}>
            <UserRound /> Profil Saya
          </DropdownMenuItem>
          <DropdownMenuItem className="px-2 py-1.5" onClick={() => setDialog('password')}>
            <KeyRound /> Ganti Password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="px-2 py-1.5" variant="destructive" onClick={onLogout}>
            <LogOut /> Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'profile' && <ProfileDialog me={me} onClose={() => setDialog(null)} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
    </>
  );
}

function ProfileDialog({ me, onClose }: { me: MeDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.name);
  const save = useMutation({
    mutationFn: () => api('/api/me', { method: 'PUT', body: { name } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profil disimpan');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Profil Saya</DialogTitle>
            <DialogDescription>Role dan divisi diatur oleh Leader atau Manager Anda.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <Avatar name={name || me.name} className="size-11 text-sm" />
            <div className="text-sm">
              <div className="font-medium">@{me.username}</div>
              <div className="text-muted-foreground">
                {ROLE_LABELS[me.role]}
                {me.divisionName ? ` · Divisi ${me.divisionName}` : ''}
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Nama lengkap</Label>
            <Input id="profile-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input id="profile-username" value={me.username} disabled />
            <p className="text-xs text-muted-foreground">Username dipakai untuk login dan tidak bisa diubah.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim() || name.trim() === me.name}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;
  const save = useMutation({
    mutationFn: () => api('/api/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      toast.success('Password berhasil diganti. Perangkat lain yang memakai akun ini otomatis keluar.');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Ganti Password</DialogTitle>
            <DialogDescription>Minimal 8 karakter. Setelah diganti, akun ini otomatis keluar dari perangkat lain.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="pw-current">Password lama</Label>
            <Input id="pw-current" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-new">Password baru</Label>
            <Input id="pw-new" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-confirm">Ulangi password baru</Label>
            <Input
              id="pw-confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={mismatch}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">Password baru tidak sama.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending || mismatch}>
              Simpan Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
