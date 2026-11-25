<script setup lang="ts">
import { Trash2, X } from 'lucide-vue-next';
import type { MaterialItem } from '../types';

defineProps<{
  open: boolean;
  items: MaterialItem[];
  locked: boolean;
}>();

const emit = defineEmits<{
  close: [];
  remove: [materialId: number];
  preview: [item: MaterialItem];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex flex-col justify-end bg-slate-900/50 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="mx-auto flex max-h-[75vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div>
            <h3 class="text-base font-semibold text-slate-900">
              已选物料清单（{{ items.length }} 项）
            </h3>
            <p class="text-xs text-slate-500">点击缩略图查看大图，可快速移出不需要的物料</p>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-3">
          <div v-if="items.length === 0" class="py-10 text-center text-sm text-slate-400">
            暂未勾选任何物料
          </div>
          <ul v-else class="divide-y divide-slate-100">
            <li
              v-for="item in items"
              :key="item.id"
              class="flex items-center gap-3 py-2.5"
            >
              <img
                :src="item.image_url"
                :alt="item.title"
                class="h-14 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-100 object-cover"
                @click="emit('preview', item)"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{{ item.title }}</p>
                <p v-if="item.description" class="mt-0.5 truncate text-xs text-slate-500">
                  {{ item.description }}
                </p>
              </div>
              <button
                v-if="!locked"
                type="button"
                class="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100"
                @click="emit('remove', item.id)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span>移出</span>
              </button>
            </li>
          </ul>
        </div>

        <div class="safe-bottom-bar border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            class="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            @click="emit('close')"
          >
            收起清单
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
