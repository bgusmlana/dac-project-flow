import { cn } from '@/lib/utils';

/** Textarea bergaya sama dengan Input. */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

/** Judul halaman + deskripsi + tombol aksi di kanan. */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

/**
 * Label kecil di atas satu isian filter/form.
 * `group` untuk sekumpulan tombol/isian (bukan satu isian), supaya klik pada label tidak menekan tombol pertama.
 */
export function Field({ label, children, className, group }: { label: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cn('grid content-start gap-1', className)} role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </Tag>
  );
}
