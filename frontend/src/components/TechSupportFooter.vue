<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import { showToast } from '../utils/toast';

const WECHAT_ID = 'viastracore';

async function copyWechat() {
  try {
    await navigator.clipboard.writeText(WECHAT_ID);
    showToast(`已复制技术支持微信号：${WECHAT_ID}`, 'success');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = WECHAT_ID;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(`已复制技术支持微信号：${WECHAT_ID}`, 'success');
  }
}
</script>

<template>
  <footer class="py-5 text-center text-xs text-slate-400">
    <div class="inline-flex flex-wrap items-center justify-center gap-1.5 px-3">
      <span>技术支持</span>
      <span>·</span>
      <span>微信号：</span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
        title="点击复制微信号"
        @click="copyWechat"
      >
        <span>{{ WECHAT_ID }}</span>
        <Copy class="h-3 w-3" />
      </button>
    </div>
  </footer>
</template>
