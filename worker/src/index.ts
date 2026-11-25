import { handleAdminRoutes } from './routes/admin';
import { handleClientRoutes } from './routes/client';
import type { Env } from './types';
import { corsHeaders, errorResponse, jsonResponse } from './utils';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 健康检查
      if (path === '/api/health' && request.method === 'GET') {
        return jsonResponse({ ok: true, timestamp: new Date().toISOString() });
      }

      // R2 图片代理读取（同域缓存与前端 ZIP 打包下载）
      if (path.startsWith('/images/') && (request.method === 'GET' || request.method === 'HEAD')) {
        const key = decodeURIComponent(path.slice('/images/'.length));
        if (!key) return errorResponse('Missing image key', 400);

        const object = await env.BUCKET.get(key);
        if (!object) {
          return errorResponse('图片不存在', 404);
        }

        const headers = new Headers(corsHeaders());
        object.writeHttpMetadata(headers);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/octet-stream');
        }
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('ETag', object.httpEtag);

        return new Response(request.method === 'HEAD' ? null : object.body, {
          status: 200,
          headers,
        });
      }

      // 管理员接口
      if (path.startsWith('/api/admin/')) {
        const adminRes = await handleAdminRoutes(request, env, path);
        if (adminRes) return adminRes;
        return errorResponse('API 接口不存在', 404);
      }

      // 客户端选品接口
      if (path.startsWith('/api/client/')) {
        const clientRes = await handleClientRoutes(request, env, path);
        if (clientRes) return clientRes;
        return errorResponse('API 接口不存在', 404);
      }

      if (path.startsWith('/api/')) {
        return errorResponse('API 接口不存在', 404);
      }

      // 兜底交由 Cloudflare Workers Static Assets 处理 SPA 页面
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Unhandled worker error:', err);
      return errorResponse(err instanceof Error ? err.message : '服务器内部错误', 500);
    }
  },
};
