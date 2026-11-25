# 互换物料在线选品系统

基于 **Vue 3 + Vite + Tailwind CSS + Cloudflare Workers + D1 (SQLite) + R2** 构建的轻量级互换物料在线选品系统，严格对应 PRD v2.0 全部需求。

## 功能概览

- **管理后台 (`/admin`)**
  - 环境变量密码登录（HMAC-SHA256 无状态签名鉴权）
  - **物料库管理**：多图批量上传，纯浏览器端 HTML5 Canvas 自动缩放（长边 `<= 1600px`）并动态压缩至严格 `< 500KB`（小于 500KB 原图直传），支持实时压缩体积对比、编辑名称/描述/排序、上架/下架切换、删除物料（历史选品记录保留名称与图片快照）；支持配置全局存储配额上限（`MAX_STORAGE_MB`，默认 `4096` MB = 4GB，严格控制在 Cloudflare R2 10GB 免费额度内）
  - **客户与访问码管理**：手动输入客户名称与可选上限，自动生成 6 位访问码与带参直达链接（`/?code=XXXXXX`）；支持实时改名不改码、状态看板（未使用 / 选图中 / 已确认）、解锁重置、禁用/删除访问码
  - **选品查看与导出**：按客户查看已选物料详情，支持一键导出 UTF-8 BOM **Excel/CSV 清单**与**打包下载所选图片 (ZIP)**（按物料名称自动重命名）
- **合作方选品端 (`/` 或 `/?code=XXXXXX`)**
  - 免注册直达：自动识别 URL 参数 `?code=XXXXXX`，缺失或无效时弹出居中口令输入框
  - 顶部明确展示 `当前选品人：{客户名称}`、限选规则与搜索框
  - 移动端/微信优先双列网格卡片，支持大图预览弹窗与抽屉快速剔除
  - 每次勾选/取消实时静默保存进度；二次确认提交后进入只读锁定模式

---

## 目录结构

```text
material-selection-system/
├── package.json              # 根目录便捷脚本
├── frontend/                 # Vue 3 + Vite + Tailwind CSS 前端
│   ├── src/
│   │   ├── api/http.ts
│   │   ├── components/       # 批量压缩上传、大图预览、已选抽屉、确认弹窗
│   │   ├── utils/            # Canvas 压缩工具、CSV/ZIP 导出工具
│   │   └── views/            # ClientSelectionView.vue / AdminDashboardView.vue
└── worker/                   # Cloudflare Workers + D1 + R2 后端
    ├── wrangler.toml
    ├── migrations/0001_init.sql
    └── src/
        ├── index.ts
        ├── auth.ts
        └── routes/           # admin.ts / client.ts
```

---

## 本地开发指南

> 环境要求：Node.js 18+

1. **安装依赖**
   ```bash
   npm run install:all
   ```

2. **初始化本地 D1 数据库**
   ```bash
   npm run db:migrate:local
   ```

3. **配置本地管理员密码（必填）**
   在 `worker/` 目录复制示例文件生成 `.dev.vars`（已加入 `.gitignore`，不会被提交到 Git）：
   ```bash
   cp worker/.dev.vars.example worker/.dev.vars
   ```
   然后修改 `worker/.dev.vars` 中的 `ADMIN_PASSWORD` 与 `TOKEN_SECRET`。

4. **同时启动后端 Worker 与前端 Vite 开发服务器**
   ```bash
   # 终端 1：启动 Cloudflare Worker (http://127.0.0.1:8787)
   npm run dev:worker

   # 终端 2：启动 Vite 前端 (http://localhost:5173，已配置 /api 与 /images 代理)
   npm run dev:frontend
   ```
   - 客户选品端：`http://localhost:5173/`
   - 管理后台：`http://localhost:5173/admin`

---

## Cloudflare 生产部署指南

1. **登录 Wrangler**
   ```bash
   npx wrangler login
   ```

2. **创建 D1 数据库与 R2 存储桶**
   ```bash
   npx wrangler d1 create material_selection_db
   npx wrangler r2 bucket create material-selection-images
   ```
   将 `d1 create` 输出的 `database_id` 填入 `worker/wrangler.toml`。

3. **执行远程数据库建表迁移**
   ```bash
   npm run db:migrate:remote
   ```

4. **设置生产环境管理员密码与签名密钥**
   ```bash
   cd worker
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put TOKEN_SECRET
   ```

5. **一键构建前端并发布到 Cloudflare Workers**
   ```bash
   cd ..
   npm run deploy
   ```
   部署后前端静态资源（`[assets]`）、`/api/*` 与 `/images/*` 均运行在同一域名下，无需额外配置跨域或图床。
