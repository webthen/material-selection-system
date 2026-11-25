<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      @click.self="!loading && emit('cancel')"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 class="text-base font-semibold text-slate-900">{{ title }}</h3>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {{ message }}
        </p>
        <div class="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            :disabled="loading"
            class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            @click="emit('cancel')"
          >
            {{ cancelText || '取消' }}
          </button>
          <button
            type="button"
            :disabled="loading"
            class="rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            :class="
              danger
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
            "
            @click="emit('confirm')"
          >
            {{ loading ? '处理中...' : confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
