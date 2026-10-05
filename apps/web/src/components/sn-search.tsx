import type { UnitDetailDto } from '@manpro/shared';
import { ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

/** Kotak cari/scan serial number (unit atau kelengkapan) → buka detail unit. */
export function SnSearch() {
  const navigate = useNavigate();
  const [sn, setSn] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="relative w-full max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!sn.trim()) return;
        setBusy(true);
        try {
          const u = await api<UnitDetailDto>(`/api/units/lookup?sn=${encodeURIComponent(sn.trim())}`);
          setSn('');
          navigate(`/units/${u.id}`);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-8 font-mono" placeholder="Cari / scan serial number…" value={sn} disabled={busy} onChange={(e) => setSn(e.target.value)} />
    </form>
  );
}
