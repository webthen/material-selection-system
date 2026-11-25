<script setup lang="ts">
import { toastState } from '../utils/toast';
import { CheckCircle2, AlertCircle, Info } from 'lucide-vue-next';
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <div
        v-for="item in toastState.items"
        :key="item.id"
        class="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg ring-1 backdrop-blur"
        :class="{
          'bg-emerald-600/95 text-white ring-emerald-500': item.type === 'success',
          'bg-rose-600/95 text-white ring-rose-500': item.type === 'error',
          'bg-slate-900/90 text-white ring-slate-700': item.type === 'info',
        }"
      >
        <CheckCircle2 v-if="item.type === 'success'" class="h-4 w-4 shrink-0" />
        <AlertCircle v-else-if="item.type === 'error'" class="h-4 w-4 shrink-0" />
        <Info v-else class="h-4 w-4 shrink-0" />
        <span>{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
