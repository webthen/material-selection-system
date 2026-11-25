import type { Env, MaterialRecord, MaterialSnapshot } from './types';

// 剔除易混淆字符 (0/O, 1/I/L)，便于手动输入与口头核对
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const MAX_IMAGE_BYTES = 512000; // 500KB (500 * 1024)
const DEFAULT_MAX_STORAGE_MB = 4096; // 默认 4GB，严格控制在 Cloudflare R2 10GB 免费额度内

export function getMaxStorageBytes(env: Env): number {
  const parsed = Number(env.MAX_STORAGE_MB);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_STORAGE_MB;
  return Math.trunc(mb * 1024 * 1024);
}

/**
 * 统计当前实际占用的 R2 图片空间（包含上架/下架物料，以及已被历史选品快照保留的已删除物料图片）
 */
export async function getUsedStorageBytes(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE((SELECT SUM(file_size) FROM materials), 0) +
         COALESCE((
           SELECT SUM(sz) FROM (
             SELECT MAX(CAST(json_extract(material_snapshot, '$.file_size') AS INTEGER)) AS sz
             FROM selections
             WHERE material_id IS NULL
               AND json_extract(material_snapshot, '$.image_key') IS NOT NULL
               AND json_extract(material_snapshot, '$.image_key') NOT IN (SELECT image_key FROM materials)
             GROUP BY json_extract(material_snapshot, '$.image_key')
           )
         ), 0) AS total_bytes`
    )
    .first<{ total_bytes: number }>();

  return Number(row?.total_bytes ?? 0);
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function generateAccessCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

export function extFromMime(mime: string): string | null {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

export function buildMaterialSnapshot(material: MaterialRecord): MaterialSnapshot {
  return {
    id: material.id,
    title: material.title,
    description: material.description,
    image_url: material.image_url,
    image_key: material.image_key,
    file_size: material.file_size,
  };
}

export function parseSnapshot(raw: string): MaterialSnapshot {
  try {
    const parsed = JSON.parse(raw) as Partial<MaterialSnapshot>;
    return {
      id: typeof parsed.id === 'number' ? parsed.id : 0,
      title: parsed.title || '已删除物料',
      description: parsed.description || '',
      image_url: parsed.image_url || '',
      image_key: parsed.image_key || '',
      file_size: typeof parsed.file_size === 'number' ? parsed.file_size : 0,
    };
  } catch {
    return {
      id: 0,
      title: '已删除物料',
      description: '',
      image_url: '',
      image_key: '',
      file_size: 0,
    };
  }
}

export async function safeParseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 清理不再被任何物料或历史快照引用的 R2 图片对象
 */
export async function deleteR2IfUnreferenced(
  db: D1Database,
  bucket: R2Bucket,
  imageKey: string
): Promise<void> {
  if (!imageKey) return;

  const matRef = await db
    .prepare('SELECT 1 FROM materials WHERE image_key = ? LIMIT 1')
    .bind(imageKey)
    .first();
  if (matRef) return;

  const snapRef = await db
    .prepare(
      "SELECT 1 FROM selections WHERE json_extract(material_snapshot, '$.image_key') = ? LIMIT 1"
    )
    .bind(imageKey)
    .first();
  if (snapRef) return;

  await bucket.delete(imageKey);
}
