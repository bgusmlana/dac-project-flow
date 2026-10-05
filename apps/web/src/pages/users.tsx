import {
  assignableRoles,
  canManageUser,
  DIVISION_ROLES,
  ROLE_LABELS,
  type DivisionDto,
  type MeDto,
  type Paginated,
  type Role,
  type UserDto,
} from '@manpro/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pager } from '@/components/list-toolbar';
import { Input } from '@/components/ui/input';
import { Tip } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';


type DialogState =
  | { type: 'form'; user: UserDto | null }
  | { type: 'password'; user: UserDto }
  | { type: 'active'; user: UserDto }
  | null;

export function UsersPage() {
  const me = useMe().data!;
  const [search, setSearch] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dialog, setDialog] = useState<DialogState>(null);

  const divisions = useQuery({ queryKey: ['divisions'], queryFn: () => api<DivisionDto[]>('/api/divisions') });

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  if (divisionId) params.set('divisionId', divisionId);

  const users = useQuery({
    queryKey: ['users', params.toString()],
    queryFn: () => api<Paginated<UserDto>>(`/api/users?${params}`),
    placeholderData: keepPreviousData,
  });

  const canCreate = assignableRoles(me).length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">User</h1>
          <p className="text-sm text-muted-foreground">
            {me.role === 'leader' ? `User divisi ${me.divisionName}` : 'Semua user'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialog({ type: 'form', user: null })}>
            <Plus /> Tambah User
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Cari nama atau username…"
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {me.role !== 'leader' && (
          <NativeSelect
            className="w-48"
            value={divisionId}
            onChange={(e) => {
              setDivisionId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua divisi</option>
            {divisions.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Divisi</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Memuat…
                </TableCell>
              </TableRow>
            )}
            {users.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {errorMessage(users.error)}
                </TableCell>
              </TableRow>
            )}
            {users.data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Tidak ada user.
                </TableCell>
              </TableRow>
            )}
            {users.data?.data.map((u) => (
              <TableRow key={u.id} className={u.isActive ? '' : 'text-muted-foreground'}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === me.id && <span className="ml-1 text-xs text-muted-foreground">(Anda)</span>}
                </TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>{u.divisionName ?? '—'}</TableCell>
                <TableCell>
                  {u.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}
                </TableCell>
                <TableCell>
                  {canManageUser(me, u) && (
                    <DropdownMenu>
                      <Tip label="Aksi: ubah, reset password, nonaktifkan">
                        <DropdownMenuTrigger className="rounded-md p-1 hover:bg-muted aria-expanded:bg-muted" aria-label="Aksi">
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                      </Tip>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialog({ type: 'form', user: u })}>
                          <Pencil /> Ubah
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDialog({ type: 'password', user: u })}>
                          <KeyRound /> Reset password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant={u.isActive ? 'destructive' : 'default'}
                          onClick={() => setDialog({ type: 'active', user: u })}
                        >
                          <Power /> {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {users.data && <Pager page={page} pageSize={pageSize} total={users.data.total} onPage={setPage} onPageSize={setPageSize} unit="user" />}

      {dialog?.type === 'form' && (
        <UserFormDialog me={me} user={dialog.user} divisions={divisions.data ?? []} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'password' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.type === 'active' && <ToggleActiveDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </div>
  );
}

function UserFormDialog({
  me,
  user,
  divisions,
  onClose,
}: {
  me: MeDto;
  user: UserDto | null;
  divisions: DivisionDto[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const roles = assignableRoles(me);
  const isLeader = me.role === 'leader';
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? roles[roles.length - 1] ?? 'staff');
  const [divisionId, setDivisionId] = useState<string>(
    String(user?.divisionId ?? (isLeader ? me.divisionId : '') ?? ''),
  );

  const needsDivision = DIVISION_ROLES.includes(role);

  const save = useMutation({
    mutationFn: () => {
      const division = needsDivision && divisionId ? Number(divisionId) : null;
      return user
        ? api<UserDto>(`/api/users/${user.id}`, { method: 'PUT', body: { name, role, divisionId: division } })
        : api<UserDto>('/api/users', { method: 'POST', body: { name, username, password, role, divisionId: division } });
    },
    onSuccess: () => {
      toast.success(user ? 'User berhasil diubah' : 'User berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['users'] });
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
            <DialogTitle>{user ? `Ubah User: ${user.username}` : 'Tambah User'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!user && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="new-username">Username</Label>
                <Input
                  id="new-username"
                  required
                  autoComplete="off"
                  placeholder="contoh: budi.qc"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
                <p className="text-xs text-muted-foreground">Huruf kecil, angka, titik, atau garis bawah. Tidak bisa diubah.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-password">Password awal</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={roles.length <= 1}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {needsDivision && (
            <div className="grid gap-2">
              <Label htmlFor="division">Divisi</Label>
              <NativeSelect
                id="division"
                required
                value={divisionId}
                disabled={isLeader}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">Pilih divisi…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api(`/api/users/${user.id}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => {
      toast.success(`Password ${user.username} berhasil direset`);
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
            reset.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Password baru untuk <b>{user.name}</b>. User akan otomatis keluar dari semua perangkat.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reset-password">Password baru</Label>
            <Input
              id="reset-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={reset.isPending}>
              Reset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActiveDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const activate = !user.isActive;
  const toggle = useMutation({
    mutationFn: () => api(`/api/users/${user.id}/active`, { method: 'PATCH', body: { isActive: activate } }),
    onSuccess: () => {
      toast.success(activate ? 'User diaktifkan' : 'User dinonaktifkan');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activate ? 'Aktifkan User' : 'Nonaktifkan User'}</DialogTitle>
          <DialogDescription>
            {activate
              ? `${user.name} akan bisa login kembali.`
              : `${user.name} tidak akan bisa login dan langsung keluar dari semua perangkat. Riwayat pekerjaannya tetap tersimpan.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant={activate ? 'default' : 'destructive'} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            {activate ? 'Aktifkan' : 'Nonaktifkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
