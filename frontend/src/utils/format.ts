export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getCodeStatusMeta(status: 0 | 1 | 2, isDisabled: 0 | 1 = 0) {
  if (isDisabled === 1) {
    return {
      label: '已停用',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    };
  }
  switch (status) {
    case 0:
      return {
        label: '未使用',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    case 1:
      return {
        label: '选图中',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 2:
      return {
        label: '已确认',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
  }
}

export function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').trim() || '未命名物料';
}
