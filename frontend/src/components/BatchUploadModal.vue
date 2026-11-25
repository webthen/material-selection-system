<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckCircle2, ImagePlus, Loader2, Trash2, UploadCloud, X, AlertTriangle } from 'lucide-vue-next';
import { createAdminMaterial } from '../api/http';
import { formatBytes, stripFileExtension } from '../utils/format';
import { compressMaterialImage } from '../utils/imageCompress';
import { showToast } from '../utils/toast';

interface QueueItem {
  uid: string;
  previewUrl: string;
  rawFile: File;
  compressedFile: File | null;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  width: number;
  height: number;
  title: string;
  description: string;
  sortOrder: number;
  stage: 'compressing' | 'ready' | 'uploading' | 'done' | 'error';
  stageText: string;
  progress: number;
  errorMsg: string;
}

const props = defineProps<{
  open: boolean;
  defaultSortBase: number;
}>();

const emit = defineEmits<{
  close: [];
  uploaded: [];
}>();

const queue = ref<QueueItem[]>([]);
const isUploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const readyCount = computed(() => queue.value.filter((q) => q.stage === 'ready').length);
const compressingCount = computed(() => queue.value.filter((q) => q.stage === 'compressing').length);
const doneCount = computed(() => queue.value.filter((q) => q.stage === 'done').length);

async function processFiles(files: FileList | File[]) {
  const list = Array.from(files);
  if (list.length === 0) return;

  const baseSort = props.defaultSortBase + queue.value.length;

  for (let i = 0; i < list.length; i++) {
    const rawFile = list[i];
    const uid = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(rawFile);

    const item: QueueItem = {
      uid,
      previewUrl,
      rawFile,
      compressedFile: null,
      originalSize: rawFile.size,
      compressedSize: 0,
      wasCompressed: false,
      width: 0,
      height: 0,
      title: stripFileExtension(rawFile.name),
      description: '',
      sortOrder: baseSort + i,
      stage: 'compressing',
      stageText: '准备压缩...',
      progress: 5,
      errorMsg: '',
    };

    queue.value.push(item);
    // 获取响应式代理项，保证进度条实时更新
    const reactiveItem = queue.value[queue.value.length - 1];

    try {
      const result = await compressMaterialImage(rawFile, (stageText, percent) => {
        reactiveItem.stageText = stageText;
        reactiveItem.progress = percent;
      });
      reactiveItem.compressedFile = result.file;
      reactiveItem.compressedSize = result.compressedSize;
      reactiveItem.wasCompressed = result.wasCompressed;
      reactiveItem.width = result.width;
      reactiveItem.height = result.height;
      reactiveItem.stage = 'ready';
      reactiveItem.stageText = result.wasCompressed
        ? `${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`
        : `原图直传 · ${formatBytes(result.compressedSize)}`;
      reactiveItem.progress = 100;
    } catch (err) {
      reactiveItem.stage = 'error';
      reactiveItem.errorMsg = err instanceof Error ? err.message : '压缩失败';
      reactiveItem.stageText = '处理失败';
    }
  }
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFiles(input.files);
    input.value = '';
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) {
    processFiles(e.dataTransfer.files);
  }
}

function removeQueueItem(uid: string) {
  const idx = queue.value.findIndex((i) => i.uid === uid);
  if (idx !== -1) {
    URL.revokeObjectURL(queue.value[idx].previewUrl);
    queue.value.splice(idx, 1);
  }
}

function clearAndClose() {
  if (isUploading.value) return;
  for (const item of queue.value) {
    URL.revokeObjectURL(item.previewUrl);
  }
  queue.value = [];
  emit('close');
}

async function uploadAllReady() {
  const targets = queue.value.filter((q) => q.stage === 'ready' && q.compressedFile);
  if (targets.length === 0) return;

  isUploading.value = true;
  let success = 0;

  for (const item of targets) {
    if (!item.title.trim()) {
      item.title = stripFileExtension(item.rawFile.name);
    }
    item.stage = 'uploading';
    item.stageText = '正在上传入库...';

    try {
      const fd = new FormData();
      fd.append('file', item.compressedFile!);
      fd.append('title', item.title.trim());
      fd.append('description', item.description.trim());
      fd.append('sort_order', String(item.sortOrder || 0));
      fd.append('status', '1');

      await createAdminMaterial(fd);
      item.stage = 'done';
      item.stageText = '已入库上架';
      success++;
    } catch (err) {
      item.stage = 'error';
      item.errorMsg = err instanceof Error ? err.message : '上传失败';
      item.stageText = '上传失败';
    }
  }

  isUploading.value = false;
  if (success > 0) {
    showToast(`成功上传 ${success} 个物料`, 'success');
    emit('uploaded');
  }
  if (queue.value.every((q) => q.stage === 'done')) {
    clearAndClose();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-sm"
      @click.self="clearAndClose"
    >
      <div class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <!-- 头部 -->
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-slate-900">批量上传物料图片</h3>
            <p class="mt-0.5 text-xs text-slate-500">
              浏览器自动等比缩放（长边 ≤ 1600px）并动态压缩至严格小于 500KB，小于 500KB 原图直传
            </p>
          </div>
          <button
            type="button"
            :disabled="isUploading"
            class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            @click="clearAndClose"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- 选择/拖拽区 -->
        <div class="flex-1 overflow-y-auto p-5">
          <div
            class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/80"
            @click="fileInputRef?.click()"
            @dragover.prevent
            @drop="handleDrop"
          >
            <ImagePlus class="h-8 w-8 text-indigo-500" />
            <p class="mt-2 text-sm font-medium text-slate-700">点击选择或拖拽多张图片到此处</p>
            <p class="mt-1 text-xs text-slate-400">支持 JPG / PNG / WebP，支持一次批量导入</p>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple
              class="hidden"
              @change="handleFileChange"
            />
          </div>

          <!-- 队列列表 -->
          <div v-if="queue.length > 0" class="mt-4 space-y-3">
            <div
              v-for="item in queue"
              :key="item.uid"
              class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-start"
            >
              <img
                :src="item.previewUrl"
                :alt="item.title"
                class="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
              />

              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs">
                    <span
                      v-if="item.stage === 'compressing' || item.stage === 'uploading'"
                      class="inline-flex items-center gap-1 font-medium text-indigo-600"
                    >
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                      {{ item.stageText }}
                    </span>
                    <span
                      v-else-if="item.stage === 'ready'"
                      class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200"
                    >
                      {{ item.stageText }}
                      <template v-if="item.width && item.height">
                        ({{ item.width }}×{{ item.height }})
                      </template>
                    </span>
                    <span
                      v-else-if="item.stage === 'done'"
                      class="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 font-medium text-white"
                    >
                      <CheckCircle2 class="h-3.5 w-3.5" />
                      {{ item.stageText }}
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-700 ring-1 ring-rose-200"
                    >
                      <AlertTriangle class="h-3.5 w-3.5" />
                      {{ item.errorMsg }}
                    </span>
                  </div>

                  <button
                    v-if="item.stage !== 'uploading' && item.stage !== 'done'"
                    type="button"
                    class="text-slate-400 hover:text-rose-600"
                    title="移除"
                    @click="removeQueueItem(item.uid)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>

                <!-- 压缩进度条 -->
                <div
                  v-if="item.stage === 'compressing'"
                  class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <div
                    class="h-full bg-indigo-500 transition-all duration-200"
                    :style="{ width: `${item.progress}%` }"
                  />
                </div>

                <div class="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input
                    v-model="item.title"
                    type="text"
                    :disabled="item.stage === 'done' || item.stage === 'uploading'"
                    placeholder="物料名称（必填）"
                    class="sm:col-span-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    v-model.number="item.sortOrder"
                    type="number"
                    :disabled="item.stage === 'done' || item.stage === 'uploading'"
                    placeholder="排序"
                    title="排序权重（越小越靠前）"
                    class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <input
                  v-model="item.description"
                  type="text"
                  :disabled="item.stage === 'done' || item.stage === 'uploading'"
                  placeholder="物料详细描述（材质、尺寸、适用场景等，选填）"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
          <span class="text-xs text-slate-500">
            待上传 {{ readyCount }} 项
            <template v-if="compressingCount > 0"> · 压缩中 {{ compressingCount }} 项</template>
            <template v-if="doneCount > 0"> · 已完成 {{ doneCount }} 项</template>
          </span>
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              :disabled="isUploading"
              class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              @click="clearAndClose"
            >
              关闭
            </button>
            <button
              type="button"
              :disabled="isUploading || compressingCount > 0 || readyCount === 0"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
              @click="uploadAllReady"
            >
              <Loader2 v-if="isUploading" class="h-4 w-4 animate-spin" />
              <UploadCloud v-else class="h-4 w-4" />
              <span>{{ isUploading ? '上传中...' : `确认上传 (${readyCount})` }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
