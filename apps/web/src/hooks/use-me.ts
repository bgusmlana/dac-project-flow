import type { MeDto } from '@manpro/shared';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

/** User yang sedang login, atau null kalau belum login. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeDto>('/api/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
    // Gangguan sesaat (server restart / sinyal putus): coba lagi beberapa kali sebelum menyerah.
    retry: 3,
    retryDelay: 1000,
  });
}
