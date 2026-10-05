import type { ProjectDetailDto, ProjectInput, UnitDto } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { ADMIN, divisionId, login } from './helpers.js';

export type Headers = Record<string, string>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Bagian respons app.inject yang dipakai test. */
export interface TestResponse {
  statusCode: number;
  body: string;
  rawPayload: Buffer;
  headers: Record<string, string | string[] | number | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

export interface World {
  app: FastifyInstance;
  req: (method: Method, url: string, headers: Headers, payload?: unknown) => Promise<TestResponse>;
  admin: Headers;
  /** Satu staff per divisi, kunci = kode divisi. */
  staff: Record<'ADMIN' | 'ASSEMBLING' | 'ACTIVATION' | 'QC' | 'PACKING' | 'LOGISTICS', Headers>;
  clientId: number;
  vendorId: number;
  productTypeId: (code: string) => number;
  productId: (code: string) => Promise<number>;
  /** Buat project + satu item + unit dengan SN berawalan `prefix`. */
  makeProject: (opts: {
    typeCode: string;
    count: number;
    prefix: string;
    optionalStages?: string[];
    accessories?: string[];
    project?: Partial<ProjectInput>;
  }) => Promise<{ project: ProjectDetailDto; itemId: number; unitIds: string[] }>;
}

/** Siapkan user per divisi, client, vendor, dan helper pembuat project. */
export async function buildWorld(app: FastifyInstance): Promise<World> {
  const req: World['req'] = async (method, url, headers, payload) => (await app.inject({ method, url, headers, payload: payload as never })) as unknown as TestResponse;
  const admin = (await login(app, ADMIN.username, ADMIN.password)).headers;

  const staff = {} as World['staff'];
  for (const code of ['ADMIN', 'ASSEMBLING', 'ACTIVATION', 'QC', 'PACKING', 'LOGISTICS'] as const) {
    const username = `staff.${code.toLowerCase()}`;
    const res = await req('POST', '/api/users', admin, { name: `Staff ${code}`, username, password: 'password123', role: 'staff', divisionId: await divisionId(app, admin, code) });
    if (res.statusCode !== 201) throw new Error(`Gagal membuat user ${username}: ${res.body}`);
    staff[code] = (await login(app, username, 'password123')).headers;
  }

  const clientId = (await req('POST', '/api/master/clients', admin, { name: 'Dinas Uji', type: 'dinas' })).json().id as number;
  const vendorId = (await req('POST', '/api/master/vendors', admin, { name: 'Vendor Uji', type: 'supplier' })).json().id as number;
  const types = (await req('GET', '/api/product-types', admin)).json() as { id: number; code: string }[];
  const productTypeId = (code: string) => types.find((t) => t.code === code)!.id;

  const products = new Map<string, number>();
  const productId = async (code: string) => {
    if (!products.has(code)) {
      const res = await req('POST', '/api/products', admin, { productTypeId: productTypeId(code), brand: 'Merek', model: `Tipe ${code}`, partNumber: `PN-${code}` });
      products.set(code, res.json().id);
    }
    return products.get(code)!;
  };

  const makeProject: World['makeProject'] = async ({ typeCode, count, prefix, optionalStages = [], accessories = [], project = {} }) => {
    const p = (await req('POST', '/api/projects', admin, { name: `Project ${prefix}`, clientId, ...project })).json() as ProjectDetailDto;
    const withItem = (
      await req('POST', `/api/projects/${p.id}/items`, admin, { productId: await productId(typeCode), vendorId, quantity: count, optionalStages, accessories })
    ).json() as ProjectDetailDto;
    const itemId = withItem.items[0]!.id;
    const serialNumbers = Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(4, '0')}`);
    const added = await req('POST', `/api/projects/${p.id}/items/${itemId}/units`, admin, { serialNumbers });
    if (added.json().inserted !== count) throw new Error(`Gagal menambah unit: ${added.body}`);
    const list = (await req('GET', `/api/projects/${p.id}/units?pageSize=200`, admin)).json().data as UnitDto[];
    const unitIds = list.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber)).map((u) => u.id);
    const project2 = (await req('GET', `/api/projects/${p.id}`, admin)).json() as ProjectDetailDto;
    return { project: project2, itemId, unitIds };
  };

  return { app, req, admin, staff, clientId, vendorId, productTypeId, productId, makeProject };
}
