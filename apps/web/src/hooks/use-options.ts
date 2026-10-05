import type { MasterDto, MasterKind, Paginated, ProductDto } from '@manpro/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Daftar master data aktif untuk dropdown. */
export function useMasterOptions<T = MasterDto & { name: string }>(kind: MasterKind) {
  return useQuery({
    queryKey: ['master', kind, 'active-options'],
    queryFn: async () => (await api<Paginated<T>>(`/api/master/${kind}?pageSize=500`)).data,
    staleTime: 60_000,
  });
}

export function useProductOptions() {
  return useQuery({
    queryKey: ['products', 'active-options'],
    queryFn: async () => (await api<Paginated<ProductDto>>('/api/products?pageSize=500')).data,
    staleTime: 60_000,
  });
}

export function useUserOptions() {
  return useQuery({
    queryKey: ['user-options'],
    queryFn: () => api<{ id: string; name: string }[]>('/api/user-options'),
    staleTime: 60_000,
  });
}
