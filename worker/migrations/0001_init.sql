-- 互换物料在线选品系统 - D1 (SQLite) 初始化建表脚本
PRAGMA foreign_keys = ON;

-- 1. 物料库表
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_key TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 512000),
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)), -- 1=上架, 0=下架
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_status_sort
  ON materials(status, sort_order ASC, id DESC);

-- 2. 客户与口令表
CREATE TABLE IF NOT EXISTS access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  max_select INTEGER NOT NULL DEFAULT 0 CHECK (max_select >= 0), -- 0表示不限制
  status INTEGER NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)), -- 0=未使用, 1=选图中, 2=已确认
  is_disabled INTEGER NOT NULL DEFAULT 0 CHECK (is_disabled IN (0, 1)), -- 0=正常, 1=已禁用
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_created ON access_codes(created_at DESC);

-- 3. 客户选品记录表
-- 当物料被删除时，material_id 置为 NULL，但 material_snapshot JSON 快照完整保留名称、描述、缩略图地址
CREATE TABLE IF NOT EXISTS selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL,
  material_id INTEGER,
  material_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (code_id) REFERENCES access_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  UNIQUE(code_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_selections_code_id ON selections(code_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_selections_material_id ON selections(material_id);
