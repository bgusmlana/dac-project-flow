import { useQueryClient } from '@tanstack/react-query';
import { Boxes, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SnakeGame } from '@/components/snake-game';
import { useMe } from '@/hooks/use-me';
import { authClient } from '@/lib/auth-client';

/**
 * Halaman login sengaja tidak menampilkan informasi apa pun tentang isi aplikasi
 * (alur kerja, divisi, jenis produk, contoh username): halaman ini bisa dibuka siapa saja.
 */
export function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (me.data) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.username({ username: username.trim().toLowerCase(), password });
    setLoading(false);
    if (error) {
      setError(error.status === 429 ? (error.message ?? 'Terlalu banyak percobaan login. Coba lagi nanti.') : 'Username atau password salah.');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    navigate('/', { replace: true });
  }

  return (
    <div className="grid min-h-svh bg-card lg:grid-cols-[1.1fr_1fr]">
      {/* Panel kiri: game ular untuk hiburan (layar lebar saja). Tidak berisi informasi apa pun. */}
      <aside className="hidden bg-sidebar lg:block">
        <SnakeGame className="h-full w-full" />
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <span className="mb-8 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="size-5" />
          </span>

          <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manajemen Project</p>

          <form onSubmit={onSubmit} className="mt-8 grid gap-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  className="h-10 pl-9"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  className="h-10 pr-10 pl-9"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                  tooltip={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            <Button type="submit" size="lg" className="h-10" disabled={loading}>
              {loading ? 'Memproses…' : 'Masuk'}
            </Button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Hanya untuk pengguna yang berwenang.
          </p>
        </div>
      </main>
    </div>
  );
}
