export interface MaterialItem {
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
  selection_count?: number;
}

export interface AccessCodeItem {
  id: number;
  code: string;
  client_name: string;
  max_select: number;
  status: 0 | 1 | 2; // 0=未使用, 1=选图中, 2=已确认
  is_disabled: 0 | 1;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  selected_count?: number;
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

export interface ClientSessionResponse {
  code: AccessCodeItem;
  materials: MaterialItem[];
  selectedIds: number[];
  confirmedItems: SelectionDetailItem[];
}

export interface StorageQuotaInfo {
  usedBytes: number;
  maxBytes: number;
}
