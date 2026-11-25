import type {
  AccessCodeItem,
  ClientSessionResponse,
  MaterialItem,
  SelectionDetailItem,
  StorageQuotaInfo,
} from '../types';

const ADMIN_TOKEN_KEY = 'material_admin_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}, useAdminAuth = false): Promise<T> {
  const headers = new Headers(options.headers);
  if (useAdminAuth) {
    const token = getAdminToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    if (useAdminAuth && response.status === 401) {
      setAdminToken(null);
    }
    throw new ApiError(data.error || `请求失败 (${response.status})`, response.status);
  }

  return data;
}

// ================= 客户端 API =================
export function fetchClientSession(code: string): Promise<ClientSessionResponse> {
  return requestJson<ClientSessionResponse>(
    `/api/client/session?code=${encodeURIComponent(code.trim().toUpperCase())}`
  );
}

export function toggleClientSelection(payload: {
  code: string;
  material_id: number;
  selected: boolean;
}): Promise<{ selectedIds: number[]; selectedCount: number; status: 0 | 1 | 2 }> {
  return requestJson('/api/client/selections/toggle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitClientSelections(code: string): Promise<{
  code: AccessCodeItem;
  confirmedItems: SelectionDetailItem[];
}> {
  return requestJson('/api/client/submit', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ================= 管理员 API =================
export function adminLogin(password: string): Promise<{ token: string; expiresAt: number }> {
  return requestJson('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function verifyAdminSession(): Promise<{ ok: boolean }> {
  return requestJson('/api/admin/verify', { method: 'GET' }, true);
}

export function fetchAdminMaterials(params?: {
  status?: 'all' | '0' | '1';
  q?: string;
}): Promise<{ materials: MaterialItem[]; storage: StorageQuotaInfo }> {
  const search = new URLSearchParams();
  if (params?.status && params.status !== 'all') search.set('status', params.status);
  if (params?.q) search.set('q', params.q);
  const qs = search.toString();
  return requestJson(`/api/admin/materials${qs ? `?${qs}` : ''}`, { method: 'GET' }, true);
}

export function createAdminMaterial(formData: FormData): Promise<{ material: MaterialItem }> {
  return requestJson(
    '/api/admin/materials',
    {
      method: 'POST',
      body: formData,
    },
    true
  );
}

export function updateAdminMaterial(
  id: number,
  payload:
    | FormData
    | {
        title?: string;
        description?: string;
        sort_order?: number;
        status?: 0 | 1;
      }
): Promise<{ material: MaterialItem }> {
  const body = payload instanceof FormData ? payload : JSON.stringify(payload);
  return requestJson(
    `/api/admin/materials/${id}`,
    {
      method: 'PATCH',
      body,
    },
    true
  );
}

export function deleteAdminMaterial(id: number): Promise<{ deleted: boolean; id: number }> {
  return requestJson(`/api/admin/materials/${id}`, { method: 'DELETE' }, true);
}

export function fetchAdminCodes(): Promise<{ codes: AccessCodeItem[] }> {
  return requestJson('/api/admin/codes', { method: 'GET' }, true);
}

export function createAdminCode(payload: {
  client_name: string;
  max_select?: number;
}): Promise<{ code: AccessCodeItem }> {
  return requestJson(
    '/api/admin/codes',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true
  );
}

export function updateAdminCode(
  id: number,
  payload: {
    client_name?: string;
    max_select?: number;
    is_disabled?: 0 | 1;
  }
): Promise<{ code: AccessCodeItem }> {
  return requestJson(
    `/api/admin/codes/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    true
  );
}

export function unlockAdminCode(id: number): Promise<{ code: AccessCodeItem }> {
  return requestJson(`/api/admin/codes/${id}/unlock`, { method: 'POST' }, true);
}

export function deleteAdminCode(id: number): Promise<{ deleted: boolean; id: number }> {
  return requestJson(`/api/admin/codes/${id}`, { method: 'DELETE' }, true);
}

export function fetchCodeSelections(id: number): Promise<{
  code: AccessCodeItem;
  items: SelectionDetailItem[];
}> {
  return requestJson(`/api/admin/codes/${id}/selections`, { method: 'GET' }, true);
}
