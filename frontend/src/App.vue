<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import ToastHost from './components/ToastHost.vue';
import AdminDashboardView from './views/AdminDashboardView.vue';
import ClientSelectionView from './views/ClientSelectionView.vue';

const currentPath = ref(window.location.pathname);

function syncPath() {
  currentPath.value = window.location.pathname;
}

const isAdminRoute = computed(() => currentPath.value.startsWith('/admin'));

onMounted(() => {
  window.addEventListener('popstate', syncPath);
});

onUnmounted(() => {
  window.removeEventListener('popstate', syncPath);
});
</script>

<template>
  <ToastHost />
  <AdminDashboardView v-if="isAdminRoute" />
  <ClientSelectionView v-else />
</template>
