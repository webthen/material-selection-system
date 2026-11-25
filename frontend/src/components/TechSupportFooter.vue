<script setup lang="ts">
import { ref } from 'vue';
import { Copy, QrCode, X } from 'lucide-vue-next';
import wechatQrUrl from '../assets/wechat-qr.jpg';
import { showToast } from '../utils/toast';

const WECHAT_ID = 'viastracore';
const qrOpen = ref(false);

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
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200/80 transition hover:bg-emerald-100 active:scale-95"
        title="打开微信二维码扫码添加"
        @click="qrOpen = true"
      >
        <QrCode class="h-3 w-3" />
        <span>微信扫码</span>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="qrOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
        @click.self="qrOpen = false"
      >
        <div class="relative w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-2xl">
          <button
            type="button"
            class="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="关闭二维码弹窗"
            @click="qrOpen = false"
          >
            <X class="h-4 w-4" />
          </button>

          <h3 class="text-base font-bold text-slate-900">技术支持微信</h3>
          <p class="mt-1 text-xs text-slate-500">使用微信扫一扫或长按识别二维码添加</p>

          <div class="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white p-2">
            <img
              :src="wechatQrUrl"
              alt="技术支持微信二维码 viastracore"
              class="mx-auto w-full max-w-[230px] rounded-xl object-contain"
            />
          </div>

          <div class="mt-3 flex items-center justify-center gap-2">
            <span class="text-xs text-slate-500">微信号：</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
              @click="copyWechat"
            >
              <span>{{ WECHAT_ID }}</span>
              <Copy class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </footer>
</template>
