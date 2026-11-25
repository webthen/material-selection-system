import { constantTimeEqual, issueAdminToken, verifyAdminRequest } from '../auth';
import type {
  AccessCodeRecord,
  Env,
  MaterialRecord,
  SelectionDetailItem,
} from '../types';
import {
  MAX_IMAGE_BYTES,
  deleteR2IfUnreferenced,
  errorResponse,
  extFromMime,
  formatBytesCompact,
  generateAccessCode,
  getMaxStorageBytes,
  getUsedStorageBytes,
  jsonResponse,
  nowIso,
  parseSnapshot,
  safeParseJson,
} from '../utils';

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (!(await verifyAdminRequest(request, env))) {
    return errorResponse('未登录或登录已过期，请重新登录管理员账号', 401);
  }
  return null;
}

export async function handleAdminRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  // 1. 管理员登录（无需校验现有 Token）
  if (path === '/api/admin/login' && request.method === 'POST') {
    const body = await safeParseJson<{ password?: string }>(request);
    if (!body || typeof body.password !== 'string' || !body.password) {
      return errorResponse('请输入管理员密码', 400);
    }
    const expected = env.ADMIN_PASSWORD || '';
    if (!expected || !constantTimeEqual(body.password, expected)) {
      return errorResponse('管理员密码错误', 401);
    }
    const { token, expiresAt } = await issueAdminToken(env);
    return jsonResponse({ token, expiresAt });
  }

  // 以下接口均需要管理员鉴权
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  if (path === '/api/admin/verify' && request.method === 'GET') {
    return jsonResponse({ ok: true });
  }

  // ================= 物料库管理 =================
  if (path === '/api/admin/materials' && request.method === 'GET') {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const q = (url.searchParams.get('q') || '').trim();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statusParam === '0' || statusParam === '1') {
      conditions.push('m.status = ?');
      params.push(Number(statusParam));
    }
    if (q) {
      conditions.push('(m.title LIKE ? OR m.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        m.*,
        (SELECT COUNT(*) FROM selections s WHERE s.material_id = m.id) AS selection_count
      FROM materials m
      ${whereClause}
      ORDER BY m.sort_order ASC, m.id DESC
    `;

    const [result, usedBytes] = await Promise.all([
      env.DB.prepare(sql).bind(...params).all<MaterialRecord & { selection_count: number }>(),
      getUsedStorageBytes(env.DB),
    ]);
    return jsonResponse({
      materials: result.results ?? [],
      storage: {
        usedBytes,
        maxBytes: getMaxStorageBytes(env),
      },
    });
  }

  if (path === '/api/admin/materials' && request.method === 'POST') {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse('请使用 multipart/form-data 上传物料图片', 400);
    }

    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      return errorResponse('缺少图片文件', 400);
    }

    const ext = extFromMime(fileEntry.type);
    if (!ext) {
      return errorResponse('仅支持 JPG / PNG / WebP 格式图片', 400);
    }
    if (fileEntry.size <= 0 || fileEntry.size > MAX_IMAGE_BYTES) {
      return errorResponse('图片压缩后体积必须严格小于 500KB (512000 字节)', 400);
    }

    const maxBytes = getMaxStorageBytes(env);
    const usedBytes = await getUsedStorageBytes(env.DB);
    if (usedBytes + fileEntry.size > maxBytes) {
      return errorResponse(
        `已达到存储空间上限（当前已用 ${formatBytesCompact(usedBytes)} / 上限 ${formatBytesCompact(maxBytes)}），请先清理闲置物料或调高配额`,
        413
      );
    }

    const rawTitle = String(formData.get('title') ?? '').trim();
    if (!rawTitle) {
      return errorResponse('请输入物料名称', 400);
    }
    const description = String(formData.get('description') ?? '').trim();
    const rawSort = Number(formData.get('sort_order') ?? 0);
    const sortOrder = Number.isFinite(rawSort) ? Math.trunc(rawSort) : 0;
    const rawStatus = formData.get('status');
    const status = rawStatus === '0' ? 0 : 1;

    const randHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const imageKey = `materials/${Date.now()}-${randHex}.${ext}`;
    const imageUrl = `/images/${imageKey}`;

    const bytes = await fileEntry.arrayBuffer();
    await env.BUCKET.put(imageKey, bytes, {
      httpMetadata: {
        contentType: fileEntry.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    const now = nowIso();
    try {
      const inserted = await env.DB.prepare(
        `INSERT INTO materials (title, description, image_url, image_key, file_size, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
        .bind(rawTitle, description, imageUrl, imageKey, fileEntry.size, status, sortOrder, now, now)
        .first<MaterialRecord>();

      return jsonResponse({ material: inserted }, 201);
    } catch (err) {
      await env.BUCKET.delete(imageKey);
      return errorResponse(err instanceof Error ? err.message : '保存物料失败', 500);
    }
  }

  const materialMatch = path.match(/^\/api\/admin\/materials\/(\d+)$/);
  if (materialMatch) {
    const materialId = Number(materialMatch[1]);
    const existing = await env.DB.prepare('SELECT * FROM materials WHERE id = ?')
      .bind(materialId)
      .first<MaterialRecord>();
    if (!existing) {
      return errorResponse('物料不存在', 404);
    }

    if (request.method === 'PATCH') {
      const contentType = request.headers.get('Content-Type') || '';
      let title = existing.title;
      let description = existing.description;
      let sortOrder = existing.sort_order;
      let status: 0 | 1 = existing.status;
      let imageUrl = existing.image_url;
      let imageKey = existing.image_key;
      let fileSize = existing.file_size;
      let oldImageKeyToCleanup: string | null = null;

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        if (formData.has('title')) {
          const t = String(formData.get('title') ?? '').trim();
          if (!t) return errorResponse('物料名称不能为空', 400);
          title = t;
        }
        if (formData.has('description')) {
          description = String(formData.get('description') ?? '').trim();
        }
        if (formData.has('sort_order')) {
          const s = Number(formData.get('sort_order'));
          if (Number.isFinite(s)) sortOrder = Math.trunc(s);
        }
        if (formData.has('status')) {
          status = formData.get('status') === '0' ? 0 : 1;
        }
        const fileEntry = formData.get('file');
        if (fileEntry instanceof File && fileEntry.size > 0) {
          const ext = extFromMime(fileEntry.type);
          if (!ext) return errorResponse('仅支持 JPG / PNG / WebP 格式图片', 400);
          if (fileEntry.size > MAX_IMAGE_BYTES) {
            return errorResponse('图片压缩后体积必须严格小于 500KB', 400);
          }
          const maxBytes = getMaxStorageBytes(env);
          const usedBytes = await getUsedStorageBytes(env.DB);
          if (usedBytes + fileEntry.size > maxBytes) {
            return errorResponse(
              `已达到存储空间上限（当前已用 ${formatBytesCompact(usedBytes)} / 上限 ${formatBytesCompact(maxBytes)}），无法替换图片`,
              413
            );
          }
          const randHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          const newKey = `materials/${Date.now()}-${randHex}.${ext}`;
          await env.BUCKET.put(newKey, await fileEntry.arrayBuffer(), {
            httpMetadata: {
              contentType: fileEntry.type,
              cacheControl: 'public, max-age=31536000, immutable',
            },
          });
          oldImageKeyToCleanup = existing.image_key;
          imageKey = newKey;
          imageUrl = `/images/${newKey}`;
          fileSize = fileEntry.size;
        }
      } else {
        const body = await safeParseJson<{
          title?: string;
          description?: string;
          sort_order?: number;
          status?: number;
        }>(request);
        if (!body) return errorResponse('请求体格式错误', 400);

        if (body.title !== undefined) {
          const t = String(body.title).trim();
          if (!t) return errorResponse('物料名称不能为空', 400);
          title = t;
        }
        if (body.description !== undefined) {
          description = String(body.description).trim();
        }
        if (body.sort_order !== undefined) {
          const s = Number(body.sort_order);
          if (!Number.isFinite(s)) return errorResponse('排序权重必须为数字', 400);
          sortOrder = Math.trunc(s);
        }
        if (body.status !== undefined) {
          if (body.status !== 0 && body.status !== 1) {
            return errorResponse('状态值必须为 0 或 1', 400);
          }
          status = body.status;
        }
      }

      const now = nowIso();
      const updated = await env.DB.prepare(
        `UPDATE materials
         SET title = ?, description = ?, image_url = ?, image_key = ?, file_size = ?, status = ?, sort_order = ?, updated_at = ?
         WHERE id = ?
         RETURNING *`
      )
        .bind(title, description, imageUrl, imageKey, fileSize, status, sortOrder, now, materialId)
        .first<MaterialRecord>();

      if (oldImageKeyToCleanup) {
        await deleteR2IfUnreferenced(env.DB, env.BUCKET, oldImageKeyToCleanup);
      }

      return jsonResponse({ material: updated });
    }

    if (request.method === 'DELETE') {
      // 删除前无需删除历史选品记录：外键 ON DELETE SET NULL 会自动保留 selections 中的 material_snapshot 快照
      await env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(materialId).run();
      await deleteR2IfUnreferenced(env.DB, env.BUCKET, existing.image_key);
      return jsonResponse({ deleted: true, id: materialId });
    }
  }

  // ================= 客户与访问码管理 =================
  if (path === '/api/admin/codes' && request.method === 'GET') {
    const sql = `
      SELECT
        ac.*,
        CASE
          WHEN ac.status = 2 THEN (SELECT COUNT(*) FROM selections s WHERE s.code_id = ac.id)
          ELSE (
            SELECT COUNT(*) FROM selections s
            INNER JOIN materials m ON s.material_id = m.id
            WHERE s.code_id = ac.id AND m.status = 1
          )
        END AS selected_count
      FROM access_codes ac
      ORDER BY ac.id DESC
    `;
    const result = await env.DB.prepare(sql).all<AccessCodeRecord>();
    return jsonResponse({ codes: result.results ?? [] });
  }

  if (path === '/api/admin/codes' && request.method === 'POST') {
    const body = await safeParseJson<{ client_name?: string; max_select?: number }>(request);
    if (!body) return errorResponse('请求体格式错误', 400);

    const clientName = String(body.client_name ?? '').trim();
    if (!clientName) {
      return errorResponse('请输入客户/合作方名称', 400);
    }
    const rawMax = body.max_select === undefined ? 0 : Number(body.max_select);
    if (!Number.isFinite(rawMax) || rawMax < 0) {
      return errorResponse('最大可选数量必须为 >= 0 的整数（0 表示不限制）', 400);
    }
    const maxSelect = Math.trunc(rawMax);
    const now = nowIso();

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateAccessCode(6);
      try {
        const inserted = await env.DB.prepare(
          `INSERT INTO access_codes (code, client_name, max_select, status, is_disabled, created_at, updated_at)
           VALUES (?, ?, ?, 0, 0, ?, ?)
           RETURNING *, 0 AS selected_count`
        )
          .bind(code, clientName, maxSelect, now, now)
          .first<AccessCodeRecord>();
        return jsonResponse({ code: inserted }, 201);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE')) continue;
        return errorResponse(msg || '创建访问码失败', 500);
      }
    }
    return errorResponse('生成唯一访问码失败，请重试', 500);
  }

  const codeActionMatch = path.match(/^\/api\/admin\/codes\/(\d+)\/(unlock|selections)$/);
  if (codeActionMatch) {
    const codeId = Number(codeActionMatch[1]);
    const action = codeActionMatch[2];

    const codeRow = await env.DB.prepare('SELECT * FROM access_codes WHERE id = ?')
      .bind(codeId)
      .first<AccessCodeRecord>();
    if (!codeRow) {
      return errorResponse('客户访问码不存在', 404);
    }

    if (action === 'unlock' && request.method === 'POST') {
      const now = nowIso();
      const updated = await env.DB.prepare(
        `UPDATE access_codes
         SET status = 1, submitted_at = NULL, updated_at = ?
         WHERE id = ?
         RETURNING *`
      )
        .bind(now, codeId)
        .first<AccessCodeRecord>();
      return jsonResponse({ code: updated });
    }

    if (action === 'selections' && request.method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT
           s.id AS selection_id,
           s.material_id,
           s.material_snapshot,
           s.created_at AS selected_at,
           m.title AS live_title,
           m.description AS live_description,
           m.image_url AS live_image_url,
           m.file_size AS live_file_size,
           m.status AS live_status
         FROM selections s
         LEFT JOIN materials m ON s.material_id = m.id
         WHERE s.code_id = ?
         ORDER BY s.created_at ASC, s.id ASC`
      )
        .bind(codeId)
        .all<{
          selection_id: number;
          material_id: number | null;
          material_snapshot: string;
          selected_at: string;
          live_title: string | null;
          live_description: string | null;
          live_image_url: string | null;
          live_file_size: number | null;
          live_status: 0 | 1 | null;
        }>();

      const items: SelectionDetailItem[] = (rows.results ?? []).map((row) => {
        const snap = parseSnapshot(row.material_snapshot);
        const isDeleted = row.material_id === null || row.live_title === null;
        // 已确认锁定后优先使用确认快照或实时数据；若原物料已删除则使用快照
        return {
          selection_id: row.selection_id,
          material_id: row.material_id,
          title: isDeleted ? snap.title : (row.live_title ?? snap.title),
          description: isDeleted ? snap.description : (row.live_description ?? snap.description),
          image_url: isDeleted ? snap.image_url : (row.live_image_url ?? snap.image_url),
          file_size: isDeleted ? snap.file_size : (row.live_file_size ?? snap.file_size),
          material_status: isDeleted ? null : row.live_status,
          is_deleted: isDeleted,
          selected_at: row.selected_at,
        };
      });

      return jsonResponse({ code: codeRow, items });
    }
  }

  const codeMatch = path.match(/^\/api\/admin\/codes\/(\d+)$/);
  if (codeMatch) {
    const codeId = Number(codeMatch[1]);
    const existing = await env.DB.prepare('SELECT * FROM access_codes WHERE id = ?')
      .bind(codeId)
      .first<AccessCodeRecord>();
    if (!existing) {
      return errorResponse('客户访问码不存在', 404);
    }

    if (request.method === 'PATCH') {
      const body = await safeParseJson<{
        client_name?: string;
        max_select?: number;
        is_disabled?: number;
      }>(request);
      if (!body) return errorResponse('请求体格式错误', 400);

      let clientName = existing.client_name;
      let maxSelect = existing.max_select;
      let isDisabled: 0 | 1 = existing.is_disabled;

      if (body.client_name !== undefined) {
        const name = String(body.client_name).trim();
        if (!name) return errorResponse('客户名称不能为空', 400);
        clientName = name;
      }
      if (body.max_select !== undefined) {
        const m = Number(body.max_select);
        if (!Number.isFinite(m) || m < 0) {
          return errorResponse('最大可选数量必须为 >= 0 的整数', 400);
        }
        maxSelect = Math.trunc(m);
      }
      if (body.is_disabled !== undefined) {
        if (body.is_disabled !== 0 && body.is_disabled !== 1) {
          return errorResponse('禁用状态必须为 0 或 1', 400);
        }
        isDisabled = body.is_disabled;
      }

      const now = nowIso();
      const updated = await env.DB.prepare(
        `UPDATE access_codes
         SET client_name = ?, max_select = ?, is_disabled = ?, updated_at = ?
         WHERE id = ?
         RETURNING *`
      )
        .bind(clientName, maxSelect, isDisabled, now, codeId)
        .first<AccessCodeRecord>();

      return jsonResponse({ code: updated });
    }

    if (request.method === 'DELETE') {
      const orphanSnaps = await env.DB.prepare(
        "SELECT json_extract(material_snapshot, '$.image_key') AS image_key FROM selections WHERE code_id = ? AND material_id IS NULL"
      )
        .bind(codeId)
        .all<{ image_key: string | null }>();

      await env.DB.prepare('DELETE FROM access_codes WHERE id = ?').bind(codeId).run();

      for (const row of orphanSnaps.results ?? []) {
        if (row.image_key) {
          await deleteR2IfUnreferenced(env.DB, env.BUCKET, row.image_key);
        }
      }

      return jsonResponse({ deleted: true, id: codeId });
    }
  }

  return null;
}
