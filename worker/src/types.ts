export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  ADMIN_PASSWORD: string;
  TOKEN_SECRET?: string;
  MAX_STORAGE_MB?: string;
}

export interface StorageQuotaInfo {
  usedBytes: number;
  maxBytes: number;
}

export interface MaterialRecord {
  id: number;
  title: string;
  description: string;
  image_url: string;
  image_key: string;
  file_size: number;
  status: 0 | 1;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MaterialSnapshot {
  id: number;
  title: string;
  description: string;
  image_url: string;
  image_key: string;
  file_size: number;
}

export interface AccessCodeRecord {
  id: number;
  code: string;
  client_name: string;
  max_select: number;
  status: 0 | 1 | 2;
  is_disabled: 0 | 1;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  selected_count?: number;
}

export interface SelectionRow {
  id: number;
  code_id: number;
  material_id: number | null;
  material_snapshot: string;
  created_at: string;
}

export interface SelectionDetailItem {
  selection_id: number;
  material_id: number | null;
  title: string;
  description: string;
  image_url: string;
  file_size: number;
  material_status: 0 | 1 | null;
  is_deleted: boolean;
  selected_at: string;
}
