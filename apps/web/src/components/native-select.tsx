import { cn } from '@/lib/utils';

/** Dropdown bawaan browser, distyle seperti Input. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none hover:border-ring hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
