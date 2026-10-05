import { useQueryClient } from '@tanstack/react-query';

/** Perbarui semua data yang terpengaruh setelah unit berpindah tahap. */
export function useInvalidateWork() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['work', 'project', 'projects', 'units', 'unit', 'packages', 'shipments', 'lots', 'dashboard']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}
