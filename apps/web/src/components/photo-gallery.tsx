import type { AttachmentDto, AttachmentEntityType } from '@manpro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useMe } from '@/hooks/use-me';
import { api, apiUpload, errorMessage } from '@/lib/api';

/**
 * Daftar foto/dokumen + tombol ambil foto.
 * Di HP, input file dengan `capture` langsung membuka kamera.
 */
export function PhotoGallery({
  entityType,
  entityId,
  category = 'foto',
  canUpload,
  title = 'Dokumentasi',
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  category?: string;
  canUpload: boolean;
  title?: string;
}) {
  const me = useMe().data!;
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = ['attachments', entityType, entityId, category];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<AttachmentDto[]>(`/api/attachments?entityType=${entityType}&entityId=${entityId}&category=${category}`),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await apiUpload(`/api/attachments?entityType=${entityType}&entityId=${entityId}&category=${category}`, f);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {title} ({list.data?.length ?? 0})
        </span>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) upload.mutate(files);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
              <Camera /> {upload.isPending ? 'Mengunggah…' : 'Ambil / Upload Foto'}
            </Button>
          </>
        )}
      </div>
      {list.data && list.data.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {list.data.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-lg border">
              <a href={a.url} target="_blank" rel="noreferrer" title={`${a.originalName} · ${a.uploadedByName ?? ''}`}>
                {a.originalName.toLowerCase().endsWith('.pdf') ? (
                  <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted p-2 text-center text-xs transition-colors hover:bg-accent">
                    <FileText className="size-6" />
                    <span className="line-clamp-2">{a.originalName}</span>
                  </div>
                ) : (
                  <img src={a.thumbUrl} alt={a.originalName} loading="lazy" className="aspect-square w-full object-cover transition-opacity hover:opacity-85" />
                )}
              </a>
              {(a.uploadedByName === me.name || me.role === 'super_admin' || me.role === 'manager') && (
                <Tip label="Hapus foto">
                <button
                  type="button"
                  aria-label="Hapus foto"
                  className="absolute top-1 right-1 hidden rounded bg-background/90 p-1 group-hover:block hover:bg-destructive hover:text-white"
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
                </Tip>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
