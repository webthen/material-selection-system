export const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 512000 bytes (500KB)
const TARGET_SAFE_BYTES = 490 * 1024; // 目标压到 <= 490KB，确保严格 < 500KB
const MAX_DIMENSION = 1600;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export interface CompressedImageResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  width: number;
  height: number;
}

function isSupportedImage(file: File): boolean {
  if (ALLOWED_MIMES.has(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function normalizeInputMime(file: File): string {
  const lower = file.type.toLowerCase();
  if (lower === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_MIMES.has(lower)) return lower;
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
}

async function decodeImageDimensionsAndSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('无法解析图片文件，请确认图片未损坏'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('浏览器 Canvas 导出图片失败'));
          return;
        }
        resolve(blob);
      },
      mime,
      quality
    );
  });
}

function replaceExtension(filename: string, ext: string): string {
  const base = filename.replace(/\.[^/.]+$/, '');
  return `${base || 'image'}.${ext}`;
}

/**
 * 纯浏览器端 HTML5 Canvas 自动压缩工具：
 * 1. 若原图严格小于 500KB，直接保留原图上传；
 * 2. 否则等比缩放长边 <= 1600px，并动态调整压缩率与尺寸，确保最终文件严格 < 500KB。
 */
export async function compressMaterialImage(
  file: File,
  onProgress?: (stage: string, percent: number) => void
): Promise<CompressedImageResult> {
  if (!isSupportedImage(file)) {
    throw new Error('仅支持 JPG / PNG / WebP 格式图片');
  }

  onProgress?.('读取图片信息...', 10);
  const decoded = await decodeImageDimensionsAndSource(file);

  try {
    // 原图本身严格小于 500KB 且 MIME 合法，直接保留原图
    if (file.size < MAX_IMAGE_SIZE_BYTES) {
      const normalizedMime = normalizeInputMime(file);
      const safeFile =
        file.type === normalizedMime
          ? file
          : new File([file], file.name, { type: normalizedMime, lastModified: file.lastModified });
      onProgress?.('原图已小于 500KB，直传保留原图', 100);
      return {
        file: safeFile,
        originalSize: file.size,
        compressedSize: safeFile.size,
        wasCompressed: false,
        width: decoded.width,
        height: decoded.height,
      };
    }

    onProgress?.('正在缩放与智能压缩...', 30);

    const inputMime = normalizeInputMime(file);
    // PNG/WebP 优先使用 WebP 保留透明通道且压缩率高；JPEG 保持 JPEG
    let outputMime = inputMime === 'image/jpeg' ? 'image/jpeg' : 'image/webp';

    const longestSide = Math.max(decoded.width, decoded.height);
    const initialScale = longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1;

    let currentScale = initialScale;
    let bestBlob: Blob | null = null;
    let finalWidth = Math.max(1, Math.round(decoded.width * currentScale));
    let finalHeight = Math.max(1, Math.round(decoded.height * currentScale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('当前浏览器不支持 Canvas 2D 压缩');
    }

    for (let round = 0; round < 4; round++) {
      finalWidth = Math.max(1, Math.round(decoded.width * currentScale));
      finalHeight = Math.max(1, Math.round(decoded.height * currentScale));
      canvas.width = finalWidth;
      canvas.height = finalHeight;

      ctx.clearRect(0, 0, finalWidth, finalHeight);
      if (outputMime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, finalWidth, finalHeight);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      decoded.draw(ctx, finalWidth, finalHeight);

      // 探测 WebP 是否受当前浏览器支持（部分旧 Safari 会回退成 PNG）
      if (round === 0 && outputMime === 'image/webp') {
        const probe = await canvasToBlob(canvas, 'image/webp', 0.85);
        if (probe.type !== 'image/webp') {
          outputMime = 'image/jpeg';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, finalWidth, finalHeight);
          decoded.draw(ctx, finalWidth, finalHeight);
        }
      }

      // 二分搜索最优压缩质量，在 < 500KB 前提下尽量保持最高画质
      let low = 0.42;
      let high = 0.92;
      let roundBest: Blob | null = null;

      for (let step = 0; step < 5; step++) {
        const mid = Number(((low + high) / 2).toFixed(2));
        const blob = await canvasToBlob(canvas, outputMime, mid);
        onProgress?.(`动态压缩中 (${Math.round(mid * 100)}% 画质)...`, 40 + round * 12 + step * 2);

        if (blob.size <= TARGET_SAFE_BYTES) {
          roundBest = blob;
          low = mid;
        } else {
          high = mid;
        }
      }

      if (!roundBest) {
        const minBlob = await canvasToBlob(canvas, outputMime, 0.4);
        if (minBlob.size < MAX_IMAGE_SIZE_BYTES) {
          roundBest = minBlob;
        }
      }

      if (roundBest && roundBest.size < MAX_IMAGE_SIZE_BYTES) {
        bestBlob = roundBest;
        break;
      }

      // 若极限画质仍 >= 500KB，缩小尺寸继续压
      currentScale *= 0.78;
    }

    if (!bestBlob || bestBlob.size >= MAX_IMAGE_SIZE_BYTES) {
      throw new Error('图片内容过于复杂，无法压缩至 500KB 以内，请更换图片后重试');
    }

    const outExt = outputMime === 'image/webp' ? 'webp' : 'jpg';
    const outFile = new File([bestBlob], replaceExtension(file.name, outExt), {
      type: outputMime,
      lastModified: Date.now(),
    });

    onProgress?.('压缩完成', 100);
    return {
      file: outFile,
      originalSize: file.size,
      compressedSize: outFile.size,
      wasCompressed: true,
      width: finalWidth,
      height: finalHeight,
    };
  } finally {
    decoded.cleanup();
  }
}
