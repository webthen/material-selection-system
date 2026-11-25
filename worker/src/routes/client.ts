import type {
  AccessCodeRecord,
  Env,
  MaterialRecord,
  SelectionDetailItem,
} from '../types';
import {
  buildMaterialSnapshot,
  errorResponse,
  jsonResponse,
  normalizeCode,
  nowIso,
  parseSnapshot,
  safeParseJson,
} from '../utils';

async function loadConfirmedItems(db: D1Database, codeId: number): Promise<SelectionDetailItem[]> {
  const rows = await db
    .prepare(
      `SELECT
         s.id AS selection_id,
         s.material_id,
         s.material_snapshot,
         s.created_at AS selected_at,
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
      live_status: 0 | 1 | null;
    }>();

  return (rows.results ?? []).map((row) => {
    const snap = parseSnapshot(row.material_snapshot);
    return {
      selection_id: row.selection_id,
      material_id: row.material_id,
      title: snap.title,
      description: snap.description,
      image_url: snap.image_url,
      file_size: snap.file_size,
      material_status: row.live_status,
      is_deleted: row.material_id === null,
      selected_at: row.selected_at,
    };
  });
}

async function getActiveSelectedIds(db: D1Database, codeId: number): Promise<number[]> {
  const rows = await db
    .prepare(
      `SELECT s.material_id
       FROM selections s
       INNER JOIN materials m ON s.material_id = m.id
       WHERE s.code_id = ? AND m.status = 1
       ORDER BY s.created_at ASC, s.id ASC`
    )
    .bind(codeId)
    .all<{ material_id: number }>();

  return (rows.results ?? []).map((r) => r.material_id);
}

export async function handleClientRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  // 1. 校验口令并获取会话、已上架物料与已选进度
  if (path === '/api/client/session' && request.method === 'GET') {
    const url = new URL(request.url);
    const codeStr = normalizeCode(url.searchParams.get('code'));
    if (!codeStr) {
      return errorResponse('请输入 6 位选品访问码', 400);
    }

    const codeRow = await env.DB.prepare('SELECT * FROM access_codes WHERE code = ?')
      .bind(codeStr)
      .first<AccessCodeRecord>();
    if (!codeRow) {
      return errorResponse('访问码无效，请核对后重新输入', 404);
    }
    if (codeRow.is_disabled === 1) {
      return errorResponse('该访问码已被停用，请联系对接人', 403);
    }

    if (codeRow.status === 2) {
      const confirmedItems = await loadConfirmedItems(env.DB, codeRow.id);
      return jsonResponse({
        code: codeRow,
        materials: [],
        selectedIds: confirmedItems
          .map((i) => i.material_id)
          .filter((id): id is number => id !== null),
        confirmedItems,
      });
    }

    const materialsResult = await env.DB.prepare(
      'SELECT * FROM materials WHERE status = 1 ORDER BY sort_order ASC, id DESC'
    ).all<MaterialRecord>();

    const selectedIds = await getActiveSelectedIds(env.DB, codeRow.id);

    return jsonResponse({
      code: codeRow,
      materials: materialsResult.results ?? [],
      selectedIds,
      confirmedItems: [],
    });
  }

  // 2. 实时静默保存单个物料的勾选/取消勾选（原子操作，避免并发竞态）
  if (path === '/api/client/selections/toggle' && request.method === 'POST') {
    const body = await safeParseJson<{
      code?: string;
      material_id?: number;
      selected?: boolean;
    }>(request);
    if (!body) return errorResponse('请求体格式错误', 400);

    const codeStr = normalizeCode(body.code);
    const materialId = Number(body.material_id);
    const selected = Boolean(body.selected);

    if (!codeStr || !Number.isInteger(materialId) || materialId <= 0) {
      return errorResponse('参数无效', 400);
    }

    const codeRow = await env.DB.prepare('SELECT * FROM access_codes WHERE code = ?')
      .bind(codeStr)
      .first<AccessCodeRecord>();
    if (!codeRow) return errorResponse('访问码无效', 404);
    if (codeRow.is_disabled === 1) return errorResponse('该访问码已被停用', 403);
    if (codeRow.status === 2) {
      return errorResponse('选品已确认锁定，如需修改请联系对接人解锁', 409);
    }

    const now = nowIso();

    if (selected) {
      const material = await env.DB.prepare('SELECT * FROM materials WHERE id = ? AND status = 1')
        .bind(materialId)
        .first<MaterialRecord>();
      if (!material) {
        return errorResponse('该物料已下架或不存在', 404);
      }

      const already = await env.DB.prepare(
        'SELECT id FROM selections WHERE code_id = ? AND material_id = ?'
      )
        .bind(codeRow.id, materialId)
        .first();

      if (!already) {
        if (codeRow.max_select > 0) {
          const activeIds = await getActiveSelectedIds(env.DB, codeRow.id);
          if (activeIds.length >= codeRow.max_select) {
            return errorResponse(`最多可选 ${codeRow.max_select} 项物料，请先取消其他物料`, 400);
          }
        }

        const snapshotJson = JSON.stringify(buildMaterialSnapshot(material));
        await env.DB.prepare(
          `INSERT OR IGNORE INTO selections (code_id, material_id, material_snapshot, created_at)
           VALUES (?, ?, ?, ?)`
        )
          .bind(codeRow.id, materialId, snapshotJson, now)
          .run();
      }

      if (codeRow.status === 0) {
        await env.DB.prepare(
          'UPDATE access_codes SET status = 1, updated_at = ? WHERE id = ? AND status = 0'
        )
          .bind(now, codeRow.id)
          .run();
      }
    } else {
      await env.DB.prepare('DELETE FROM selections WHERE code_id = ? AND material_id = ?')
        .bind(codeRow.id, materialId)
        .run();
    }

    const updatedCode = await env.DB.prepare('SELECT status FROM access_codes WHERE id = ?')
      .bind(codeRow.id)
      .first<{ status: 0 | 1 | 2 }>();
    const selectedIds = await getActiveSelectedIds(env.DB, codeRow.id);

    return jsonResponse({
      selectedIds,
      selectedCount: selectedIds.length,
      status: updatedCode?.status ?? codeRow.status,
    });
  }

  // 3. 确认提交并锁定
  if (path === '/api/client/submit' && request.method === 'POST') {
    const body = await safeParseJson<{ code?: string }>(request);
    const codeStr = normalizeCode(body?.code);
    if (!codeStr) return errorResponse('缺少访问码', 400);

    const codeRow = await env.DB.prepare('SELECT * FROM access_codes WHERE code = ?')
      .bind(codeStr)
      .first<AccessCodeRecord>();
    if (!codeRow) return errorResponse('访问码无效', 404);
    if (codeRow.is_disabled === 1) return errorResponse('该访问码已被停用', 403);

    if (codeRow.status === 2) {
      const confirmedItems = await loadConfirmedItems(env.DB, codeRow.id);
      return jsonResponse({ code: codeRow, confirmedItems });
    }

    // 清理提交前已被管理员下架或删除的未锁定草稿条目
    await env.DB.prepare(
      `DELETE FROM selections
       WHERE code_id = ?
         AND (material_id IS NULL OR material_id NOT IN (SELECT id FROM materials WHERE status = 1))`
    )
      .bind(codeRow.id)
      .run();

    // 刷新最新物料信息到快照，保证确认瞬间的名称/描述/图片准确无误
    const activeSelections = await env.DB.prepare(
      `SELECT s.id AS selection_id, m.*
       FROM selections s
       INNER JOIN materials m ON s.material_id = m.id
       WHERE s.code_id = ? AND m.status = 1`
    )
      .bind(codeRow.id)
      .all<MaterialRecord & { selection_id: number }>();

    const rows = activeSelections.results ?? [];
    if (rows.length === 0) {
      return errorResponse('请至少选择 1 项物料后再确认提交', 400);
    }
    if (codeRow.max_select > 0 && rows.length > codeRow.max_select) {
      return errorResponse(`已选数量超过上限（最多可选 ${codeRow.max_select} 项）`, 400);
    }

    const statements = rows.map((row) => {
      const snap = JSON.stringify(buildMaterialSnapshot(row));
      return env.DB.prepare('UPDATE selections SET material_snapshot = ? WHERE id = ?').bind(
        snap,
        row.selection_id
      );
    });

    const now = nowIso();
    statements.push(
      env.DB.prepare(
        'UPDATE access_codes SET status = 2, submitted_at = ?, updated_at = ? WHERE id = ?'
      ).bind(now, now, codeRow.id)
    );

    await env.DB.batch(statements);

    const updatedCode = await env.DB.prepare('SELECT * FROM access_codes WHERE id = ?')
      .bind(codeRow.id)
      .first<AccessCodeRecord>();
    const confirmedItems = await loadConfirmedItems(env.DB, codeRow.id);

    return jsonResponse({ code: updatedCode, confirmedItems });
  }

  return null;
}
