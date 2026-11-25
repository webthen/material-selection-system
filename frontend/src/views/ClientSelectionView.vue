<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Check,
  ChevronUp,
  KeyRound,
  Lock,
  Search,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-vue-next';
import {
  fetchClientSession,
  submitClientSelections,
  toggleClientSelection,
} from '../api/http';
import ConfirmModal from '../components/ConfirmModal.vue';
import ImagePreviewModal, { type PreviewItem } from '../components/ImagePreviewModal.vue';
import SelectedDrawer from '../components/SelectedDrawer.vue';
import TechSupportFooter from '../components/TechSupportFooter.vue';
import type { AccessCodeItem, MaterialItem, SelectionDetailItem } from '../types';
import { formatDateTime } from '../utils/format';
import { showToast } from '../utils/toast';

const codeInput = ref('');
const activeCode = ref<AccessCodeItem | null>(null);
const materials = ref<MaterialItem[]>([]);
const selectedIds = ref<number[]>([]);
const confirmedItems = ref<SelectionDetailItem[]>([]);

const loading = ref(false);
const authError = ref('');
const searchQuery = ref('');
const syncingCount = ref(0);

const drawerOpen = ref(false);
const submitConfirmOpen = ref(false);
const submitting = ref(false);

const previewIndex = ref<number | null>(null);

const isLocked = computed(() => activeCode.value?.status === 2);

const selectedIdSet = computed(() => new Set(selectedIds.value));

const filteredMaterials = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return materials.value;
  return materials.value.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
  );
});

const filteredConfirmedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return confirmedItems.value;
  return confirmedItems.value.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
  );
});

const selectedMaterialItems = computed(() => {
  const map = new Map(materials.value.map((m) => [m.id, m]));
  return selectedIds.value
    .map((id) => map.get(id))
    .filter((item): item is MaterialItem => Boolean(item));
});

const previewList = computed<PreviewItem[]>(() => {
  if (isLocked.value) {
    return filteredConfirmedItems.value.map((item) => ({
      id: item.material_id,
      title: item.title,
      description: item.description,
      image_url: item.image_url,
    }));
  }
  return filteredMaterials.value.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    image_url: item.image_url,
  }));
});

const currentPreviewItem = computed<PreviewItem | null>(() => {
  if (previewIndex.value === null) return null;
  return previewList.value[previewIndex.value] ?? null;
});

async function loadSession(rawCode: string, updateUrl = true) {
  const normalized = rawCode.trim().toUpperCase();
  if (!normalized) {
    authError.value = '请输入 6 位选品访问码';
    return;
  }

  loading.value = true;
  authError.value = '';
  try {
    const res = await fetchClientSession(normalized);
    activeCode.value = res.code;
    materials.value = res.materials;
    selectedIds.value = res.selectedIds;
    confirmedItems.value = res.confirmedItems;
    codeInput.value = normalized;

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('code', normalized);
      window.history.replaceState({}, '', url.toString());
    }
  } catch (err) {
    activeCode.value = null;
    authError.value = err instanceof Error ? err.message : '访问码无效，请核对后重新输入';
  } finally {
    loading.value = false;
  }
}

function handleSwitchCode() {
  activeCode.value = null;
  materials.value = [];
  selectedIds.value = [];
  confirmedItems.value = [];
  authError.value = '';
  codeInput.value = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  window.history.replaceState({}, '', url.toString());
}

async function handleToggle(materialId: number) {
  if (!activeCode.value || isLocked.value) return;

  const currentlySelected = selectedIdSet.value.has(materialId);
  const nextSelected = !currentlySelected;

  if (
    nextSelected &&
    activeCode.value.max_select > 0 &&
    selectedIds.value.length >= activeCode.value.max_select
  ) {
    showToast(`最多可选 ${activeCode.value.max_select} 项物料，请先取消其他物料`, 'error');
    return;
  }

  // 乐观更新，保证移动端点击零延迟
  const prevIds = [...selectedIds.value];
  if (nextSelected) {
    selectedIds.value = [...selectedIds.value, materialId];
  } else {
    selectedIds.value = selectedIds.value.filter((id) => id !== materialId);
  }

  syncingCount.value++;
  try {
    const res = await toggleClientSelection({
      code: activeCode.value.code,
      material_id: materialId,
      selected: nextSelected,
    });
    selectedIds.value = res.selectedIds;
    if (activeCode.value) {
      activeCode.value.status = res.status;
    }
  } catch (err) {
    selectedIds.value = prevIds;
    showToast(err instanceof Error ? err.message : '保存失败，请检查网络', 'error');
  } finally {
    syncingCount.value = Math.max(0, syncingCount.value - 1);
  }
}

async function handleConfirmSubmit() {
  if (!activeCode.value || submitting.value) return;
  submitting.value = true;
  try {
    const res = await submitClientSelections(activeCode.value.code);
    activeCode.value = res.code;
    confirmedItems.value = res.confirmedItems;
    submitConfirmOpen.value = false;
    drawerOpen.value = false;
    previewIndex.value = null;
    showToast('已确认提交选品清单', 'success');
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交失败，请重试', 'error');
  } finally {
    submitting.value = false;
  }
}

function openPreviewByIndex(index: number) {
  previewIndex.value = index;
}

function openPreviewFromDrawer(item: MaterialItem) {
  const idx = filteredMaterials.value.findIndex((m) => m.id === item.id);
  if (idx !== -1) {
    drawerOpen.value = false;
    previewIndex.value = idx;
  }
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get('code');
  if (codeFromUrl && codeFromUrl.trim()) {
    codeInput.value = codeFromUrl.trim().toUpperCase();
    loadSession(codeInput.value, false);
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- 未验证 / 口令输入页 -->
    <div
      v-if="!activeCode"
      class="flex min-h-screen flex-col items-center justify-center px-4 py-10"
    >
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/70 ring-1 ring-slate-100">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <KeyRound class="h-6 w-6" />
        </div>
        <h1 class="mt-4 text-center text-lg font-bold text-slate-900">
          互换物料在线选品
        </h1>
        <p class="mt-1.5 text-center text-xs leading-relaxed text-slate-500">
          请输入对接人提供的 6 位专属访问码，无需注册即可开始选品
        </p>

        <form class="mt-6 space-y-4" @submit.prevent="loadSession(codeInput)">
          <div>
            <input
              v-model="codeInput"
              type="text"
              maxlength="6"
              autocomplete="off"
              autocapitalize="characters"
              placeholder="例如：K8M92P"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-center font-mono text-xl font-bold tracking-[0.28em] text-slate-900 uppercase transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              @input="codeInput = codeInput.toUpperCase()"
            />
          </div>

          <p
            v-if="authError"
            class="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-600"
          >
            {{ authError }}
          </p>

          <button
            type="submit"
            :disabled="loading || !codeInput.trim()"
            class="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
          >
            {{ loading ? '正在校验身份...' : '进入选品大厅' }}
          </button>
        </form>
      </div>
      <TechSupportFooter class="mt-4" />
    </div>

    <!-- 已验证进入选品页 -->
    <div v-else class="pb-28">
      <!-- 顶部身份与搜索栏 -->
      <header class="safe-top-bar sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-3 pt-2.5 pb-3 backdrop-blur-md">
        <div class="mx-auto max-w-5xl space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <UserCheck class="h-4 w-4" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-bold text-slate-900">
                    当前选品人：{{ activeCode.client_name }}
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span class="font-mono">口令 {{ activeCode.code }}</span>
                  <span>·</span>
                  <span>
                    {{
                      activeCode.max_select > 0
                        ? `限选 ${activeCode.max_select} 项`
                        : '数量不限'
                    }}
                  </span>
                  <template v-if="!isLocked">
                    <span>·</span>
                    <span class="text-emerald-600">
                      {{ syncingCount > 0 ? '正在保存...' : '已自动保存' }}
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-1.5">
              <span
                class="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                :class="
                  isLocked
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                "
              >
                {{ isLocked ? '已确认' : '选图中' }}
              </span>
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                @click="handleSwitchCode"
              >
                切换
              </button>
            </div>
          </div>

          <!-- 关键词搜索框 -->
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜索物料名称或描述关键词..."
              class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              @click="searchQuery = ''"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <!-- 主内容区 -->
      <main class="mx-auto max-w-5xl px-3 pt-3">
        <!-- 已确认只读锁定提示条 -->
        <div
          v-if="isLocked"
          class="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Lock class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold">
              已提交给管理员，如需修改请联系对接人解锁
            </p>
            <p class="mt-1 text-xs text-emerald-700">
              共确认 {{ confirmedItems.length }} 项物料 · 提交时间：{{ formatDateTime(activeCode.submitted_at) }}
            </p>
          </div>
        </div>

        <!-- 锁定模式下的已选物料只读网格 -->
        <template v-if="isLocked">
          <div
            v-if="filteredConfirmedItems.length === 0"
            class="py-16 text-center text-sm text-slate-400"
          >
            没有匹配的已确认物料
          </div>
          <div
            v-else
            class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4"
          >
            <article
              v-for="(item, idx) in filteredConfirmedItems"
              :key="item.selection_id"
              class="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
            >
              <div
                class="relative aspect-square cursor-pointer overflow-hidden bg-slate-100"
                @click="openPreviewByIndex(idx)"
              >
                <img
                  :src="item.image_url"
                  :alt="item.title"
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
                <span class="absolute right-2 top-2 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[11px] font-medium text-white">
                  已选定
                </span>
              </div>
              <div class="p-2.5">
                <h3 class="line-clamp-1 text-sm font-semibold text-slate-900">{{ item.title }}</h3>
                <p class="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-slate-500">
                  {{ item.description || '点击图片查看大图详情' }}
                </p>
              </div>
            </article>
          </div>
        </template>

        <!-- 正常选品双列卡片网格 -->
        <template v-else>
          <div
            v-if="filteredMaterials.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center text-slate-400"
          >
            <Sparkles class="h-8 w-8 text-slate-300" />
            <p class="mt-2 text-sm">
              {{ searchQuery ? '没有找到匹配的物料' : '管理员暂未上架可选物料' }}
            </p>
          </div>

          <div
            v-else
            class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4"
          >
            <article
              v-for="(item, idx) in filteredMaterials"
              :key="item.id"
              class="group relative flex flex-col overflow-hidden rounded-2xl bg-white transition-all"
              :class="
                selectedIdSet.has(item.id)
                  ? 'ring-2 ring-indigo-600 shadow-md shadow-indigo-500/10'
                  : 'border border-slate-200/80 shadow-sm'
              "
            >
              <!-- 图片区域（点击查看大图） -->
              <div
                class="relative aspect-square cursor-pointer overflow-hidden bg-slate-100"
                @click="openPreviewByIndex(idx)"
              >
                <img
                  :src="item.image_url"
                  :alt="item.title"
                  loading="lazy"
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />

                <!-- 右上角勾选框（大触控热区） -->
                <button
                  type="button"
                  class="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90"
                  :aria-label="selectedIdSet.has(item.id) ? '取消选中' : '选中物料'"
                  @click.stop="handleToggle(item.id)"
                >
                  <span
                    class="flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm transition"
                    :class="
                      selectedIdSet.has(item.id)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-white bg-black/35 text-transparent backdrop-blur-sm'
                    "
                  >
                    <Check class="h-4 w-4 stroke-[3]" />
                  </span>
                </button>
              </div>

              <!-- 标题与简短描述 -->
              <div class="flex flex-1 flex-col p-2.5" @click="openPreviewByIndex(idx)">
                <h3 class="line-clamp-1 text-sm font-semibold text-slate-900">
                  {{ item.title }}
                </h3>
                <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {{ item.description || '点击查看物料详情' }}
                </p>
              </div>
            </article>
          </div>
        </template>

        <TechSupportFooter class="mt-4" />
      </main>

      <!-- 底部悬浮栏（未锁定状态） -->
      <footer
        v-if="!isLocked"
        class="safe-bottom-bar fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)]"
      >
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <button
            type="button"
            class="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-left transition hover:bg-slate-200 active:scale-[0.98]"
            @click="drawerOpen = true"
          >
            <div>
              <div class="flex items-center gap-1 text-sm font-bold text-slate-900">
                <span>
                  已选 {{ selectedIds.length }}
                  <template v-if="activeCode.max_select > 0">
                    / {{ activeCode.max_select }}
                  </template>
                  项
                </span>
                <ChevronUp class="h-4 w-4 text-slate-500" />
              </div>
              <p class="text-[11px] text-slate-500">点击展开已选清单</p>
            </div>
          </button>

          <button
            type="button"
            :disabled="selectedIds.length === 0"
            class="flex-1 max-w-[180px] rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            @click="submitConfirmOpen = true"
          >
            确认提交
          </button>
        </div>
      </footer>

      <!-- 已选清单抽屉 -->
      <SelectedDrawer
        :open="drawerOpen"
        :items="selectedMaterialItems"
        :locked="isLocked"
        @close="drawerOpen = false"
        @remove="handleToggle"
        @preview="openPreviewFromDrawer"
      />

      <!-- 大图预览弹窗 -->
      <ImagePreviewModal
        :item="currentPreviewItem"
        :selected="
          currentPreviewItem?.id != null ? selectedIdSet.has(currentPreviewItem.id) : false
        "
        :locked="isLocked"
        :has-prev="previewIndex !== null && previewIndex > 0"
        :has-next="previewIndex !== null && previewIndex < previewList.length - 1"
        @close="previewIndex = null"
        @prev="previewIndex !== null && previewIndex > 0 && (previewIndex = previewIndex - 1)"
        @next="
          previewIndex !== null &&
            previewIndex < previewList.length - 1 &&
            (previewIndex = previewIndex + 1)
        "
        @toggle="currentPreviewItem?.id != null && handleToggle(currentPreviewItem.id)"
      />

      <!-- 提交二次确认弹窗 -->
      <ConfirmModal
        :open="submitConfirmOpen"
        title="确认提交最终选品？"
        :message="`您当前共选中了 ${selectedIds.length} 项物料。\n提交后选品清单将锁定不可再修改，如需调整需联系对接人解锁。`"
        confirm-text="确认提交并锁定"
        :loading="submitting"
        @cancel="submitConfirmOpen = false"
        @confirm="handleConfirmSubmit"
      />
    </div>
  </div>
</template>
