import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui-extra';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { BulkPanelProps } from './stage-panels';

/** Catat instalasi di lokasi client: scan SN unit yang terpasang di satu lokasi. */
export function InstallationPanel(_: BulkPanelProps) {
  const invalidate = useInvalidateWork();
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const serialNumbers = text.split(/[\s,;]+/).filter(Boolean);

  const run = useMutation({
    mutationFn: () => api<{ moved: number }>('/api/work/installation/complete', { method: 'POST', body: { serialNumbers, location, notes } }),
    onSuccess: (r) => {
      toast.success(`${formatNumber(r.moved)} unit tercatat terinstal`);
      setText('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catat Instalasi</CardTitle>
        <CardDescription>Scan SN unit yang sudah terpasang di satu lokasi. Foto instalasi bisa ditambahkan di halaman detail unit.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1">
          <Label>Lokasi</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="contoh: SDN 1 Kota A, Ruang Kelas 3" />
        </div>
        <div className="grid gap-1">
          <Label>Serial number unit ({formatNumber(serialNumbers.length)})</Label>
          <Textarea className="min-h-32 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Scan SN satu per baris'} />
        </div>
        <div className="grid gap-1">
          <Label>Catatan</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button className="justify-self-start" disabled={!location.trim() || serialNumbers.length === 0 || run.isPending} onClick={() => run.mutate()}>
          <CheckCircle2 /> Selesai Instalasi
        </Button>
      </CardContent>
    </Card>
  );
}
