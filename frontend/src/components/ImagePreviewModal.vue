<script setup lang="ts">
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';

export interface PreviewItem {
  id: number | null;
  title: string;
  description: string;
  image_url: string;
}

defineProps<{
  item: PreviewItem | null;
  selected: boolean;
  locked: boolean;
  hasPrev: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  close: [];
  toggle: [];
  prev: [];
  next: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="item"
      class="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-white"
      @click.self="emit('close')"
    >
      <!-- 顶部栏 -->
      <div class="safe-top-bar flex items-center justify-between px-4 py-3">
        <span class="truncate pr-4 text-sm font-medium text-slate-200">{{ item.title }}</span>
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="关闭大图预览"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- 中部高清大图 -->
      <div class="relative flex flex-1 items-center justify-center overflow-hidden px-3 py-2">
        <button
          v-if="hasPrev"
          type="button"
          class="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70"
          aria-label="上一张"
          @click="emit('prev')"
        >
          <ChevronLeft class="h-6 w-6" />
        </button>

        <img
          :src="item.image_url"
          :alt="item.title"
          class="max-h-full max-w-full rounded-lg object-contain select-none"
        />

        <button
          v-if="hasNext"
          type="button"
          class="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70"
          aria-label="下一张"
          @click="emit('next')"
        >
          <ChevronRight class="h-6 w-6" />
        </button>
      </div>

      <!-- 底部信息与选品按钮 -->
      <div class="safe-bottom-bar border-t border-white/10 bg-slate-900/95 px-4 pt-3.5 pb-4">
        <div class="mx-auto max-w-2xl">
          <h3 class="text-base font-semibold text-white">{{ item.title }}</h3>
          <p
            v-if="item.description"
            class="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-300"
          >
            {{ item.description }}
          </p>
          <p v-else class="mt-1 text-xs text-slate-400">暂无补充描述</p>

          <div v-if="!locked" class="mt-4">
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:scale-[0.99]"
              :class="
                selected
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              "
              @click="emit('toggle')"
            >
              <Check v-if="selected" class="h-4 w-4" />
              <span>{{ selected ? '已选中（点击取消选中）' : '选中此物料' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
