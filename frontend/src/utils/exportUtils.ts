import JSZip from 'jszip';
import type { SelectionDetailItem } from '../types';
import { formatDateTime } from './format';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim() || '未命名';
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出带 UTF-8 BOM 的 CSV 清单（Excel 打开中文不乱码）
 */
export function exportSelectionsCsv(
  clientName: string,
  code: string,
  items: SelectionDetailItem[]
): void {
  const origin = window.location.origin;
  const header = ['序号', '物料名称', '物料描述', '图片链接', '文件大小(KB)', '物料状态', '选中时间'];

  const rows = items.map((item, idx) => {
    const statusLabel = item.is_deleted
      ? '原物料已删除(快照)'
      : item.material_status === 0
        ? '已下架'
        : '已上架';
    const fullImageUrl = item.image_url.startsWith('http')
      ? item.image_url
      : `${origin}${item.image_url}`;
    const sizeKb = item.file_size ? Math.round(item.file_size / 1024) : 0;

    return [
      idx + 1,
      item.title,
      item.description,
      fullImageUrl,
      sizeKb,
      statusLabel,
      formatDateTime(item.selected_at),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = '\uFEFF' + [header.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `${sanitizeFilename(clientName)}_选品清单_${code}.csv`;
  triggerDownload(blob, filename);
}

function inferExtension(contentType: string | null, url: string): string {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * 打包下载客户所选全部图片（自动以物料名称重命名，重名自动加序号后缀）
 */
export async function downloadSelectionsZip(
  clientName: string,
  code: string,
  items: SelectionDetailItem[],
  onProgress?: (done: number, total: number) => void
): Promise<{ successCount: number; failedTitles: string[] }> {
  const zip = new JSZip();
  const folder = zip.folder(`${sanitizeFilename(clientName)}_${code}`) ?? zip;
  const usedNames = new Map<string, number>();
  const failedTitles: string[] = [];
  let successCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const res = await fetch(item.image_url);
      if (!res.ok) {
        failedTitles.push(item.title);
        continue;
      }
      const blob = await res.blob();
      const ext = inferExtension(res.headers.get('Content-Type'), item.image_url);
      const baseName = sanitizeFilename(item.title);
      const count = (usedNames.get(baseName) ?? 0) + 1;
      usedNames.set(baseName, count);

      const fileName = count === 1 ? `${baseName}.${ext}` : `${baseName}_${count}.${ext}`;
      folder.file(fileName, blob);
      successCount++;
    } catch {
      failedTitles.push(item.title);
    } finally {
      onProgress?.(i + 1, items.length);
    }
  }

  if (successCount === 0) {
    throw new Error('没有可下载的图片文件');
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipName = `${sanitizeFilename(clientName)}_选品图片_${code}.zip`;
  triggerDownload(zipBlob, zipName);

  return { successCount, failedTitles };
}
