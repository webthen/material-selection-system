<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Archive,
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Layers,
  Link as LinkIcon,
  Lock,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-vue-next';
import {
  adminLogin,
  createAdminCode,
  deleteAdminCode,
  deleteAdminMaterial,
  fetchAdminCodes,
  fetchAdminMaterials,
  fetchCodeSelections,
  getAdminToken,
  setAdminToken,
  unlockAdminCode,
  updateAdminCode,
  updateAdminMaterial,
  verifyAdminSession,
} from '../api/http';
import BatchUploadModal from '../components/BatchUploadModal.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import TechSupportFooter from '../components/TechSupportFooter.vue';
import type {
  AccessCodeItem,
  MaterialItem,
  SelectionDetailItem,
  StorageQuotaInfo,
} from '../types';
import { downloadSelectionsZip, exportSelectionsCsv } from '../utils/exportUtils';
import { formatBytes, formatDateTime, getCodeStatusMeta } from '../utils/format';
import { compressMaterialImage } from '../utils/imageCompress';
import { showToast } from '../utils/toast';

const isAuthenticated = ref(false);
const checkingAuth = ref(true);
const loginPassword = ref('');
const loginLoading = ref(false);
const loginError = ref('');

const activeTab = ref<'codes' | 'materials'>('codes');

// ================= 物料库状态 =================
const materials = ref<MaterialItem[]>([]);
const storageQuota = ref<StorageQuotaInfo | null>(null);
const materialsLoading = ref(false);
const materialSearch = ref('');
const materialStatusFilter = ref<'all' | '1' | '0'>('all');
const uploadModalOpen = ref(false);

const editingMaterial = ref<MaterialItem | null>(null);
const editMatForm = ref({
  title: '',
  description: '',
  sort_order: 0,
  status: 1 as 0 | 1,
});
const editMatNewFile = ref<File | null>(null);
const editMatCompressInfo = ref('');
const savingMaterial = ref(false);

// ================= 客户访问码状态 =================
const codes = ref<AccessCodeItem[]>([]);
const codesLoading = ref(false);
const codeSearch = ref('');
const newClientForm = ref({
  client_name: '',
  max_select: 0,
});
const creatingCode = ref(false);

const editingCode = ref<AccessCodeItem | null>(null);
const editCodeForm = ref({
  client_name: '',
  max_select: 0,
});
const savingCode = ref(false);

// ================= 客户选品详情与导出 =================
const viewingCode = ref<AccessCodeItem | null>(null);
const viewingItems = ref<SelectionDetailItem[]>([]);
const loadingSelections = ref(false);
const zipProgress = ref<{ done: number; total: number } | null>(null);

// ================= 通用二次确认 =================
const confirmState = ref<{
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  loading: boolean;
  onConfirm: (() => Promise<void>) | null;
}>({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  danger: false,
  loading: false,
  onConfirm: null,
});

const filteredMaterials = computed(() => {
  const q = materialSearch.value.trim().toLowerCase();
  return materials.value.filter((m) => {
    if (materialStatusFilter.value === '1' && m.status !== 1) return false;
    if (materialStatusFilter.value === '0' && m.status !== 0) return false;
    if (!q) return true;
    return (
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });
});

const filteredCodes = computed(() => {
  const q = codeSearch.value.trim().toLowerCase();
  if (!q) return codes.value;
  return codes.value.filter(
    (c) =>
      c.client_name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
  );
});

const maxSortOrder = computed(() => {
  if (materials.value.length === 0) return 0;
  return Math.max(...materials.value.map((m) => m.sort_order)) + 1;
});

const storagePercent = computed(() => {
  if (!storageQuota.value || storageQuota.value.maxBytes <= 0) return 0;
  return Math.min(100, (storageQuota.value.usedBytes / storageQuota.value.maxBytes) * 100);
});

function buildClientLink(code: string): string {
  return `${window.location.origin}/?code=${code}`;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`已复制${label}`, 'success');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(`已复制${label}`, 'success');
  }
}

async function loadAllData() {
  await Promise.all([loadCodes(), loadMaterials()]);
}

async function loadMaterials() {
  materialsLoading.value = true;
  try {
    const res = await fetchAdminMaterials();
    materials.value = res.materials;
    storageQuota.value = res.storage;
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载物料失败', 'error');
  } finally {
    materialsLoading.value = false;
  }
}

async function loadCodes() {
  codesLoading.value = true;
  try {
    const res = await fetchAdminCodes();
    codes.value = res.codes;
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载客户列表失败', 'error');
  } finally {
    codesLoading.value = false;
  }
}

async function handleLogin() {
  if (!loginPassword.value.trim()) {
    loginError.value = '请输入管理员密码';
    return;
  }
  loginLoading.value = true;
  loginError.value = '';
  try {
    const res = await adminLogin(loginPassword.value);
    setAdminToken(res.token);
    isAuthenticated.value = true;
    loginPassword.value = '';
    await loadAllData();
  } catch (err) {
    loginError.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    loginLoading.value = false;
  }
}

function handleLogout() {
  setAdminToken(null);
  isAuthenticated.value = false;
}

// ================= 物料操作 =================
function openEditMaterial(m: MaterialItem) {
  editingMaterial.value = m;
  editMatForm.value = {
    title: m.title,
    description: m.description,
    sort_order: m.sort_order,
    status: m.status,
  };
  editMatNewFile.value = null;
  editMatCompressInfo.value = '';
}

async function handleEditMaterialFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const raw = input.files?.[0];
  if (!raw) return;
  try {
    editMatCompressInfo.value = '正在压缩处理...';
    const result = await compressMaterialImage(raw);
    editMatNewFile.value = result.file;
    editMatCompressInfo.value = result.wasCompressed
      ? `已压缩: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`
      : `原图直传: ${formatBytes(result.compressedSize)}`;
  } catch (err) {
    editMatNewFile.value = null;
    editMatCompressInfo.value = '';
    showToast(err instanceof Error ? err.message : '图片处理失败', 'error');
  } finally {
    input.value = '';
  }
}

async function saveMaterialEdit() {
  if (!editingMaterial.value) return;
  if (!editMatForm.value.title.trim()) {
    showToast('物料名称不能为空', 'error');
    return;
  }
  savingMaterial.value = true;
  try {
    if (editMatNewFile.value) {
      const fd = new FormData();
      fd.append('title', editMatForm.value.title.trim());
      fd.append('description', editMatForm.value.description.trim());
      fd.append('sort_order', String(editMatForm.value.sort_order || 0));
      fd.append('status', String(editMatForm.value.status));
      fd.append('file', editMatNewFile.value);
      await updateAdminMaterial(editingMaterial.value.id, fd);
    } else {
      await updateAdminMaterial(editingMaterial.value.id, {
        title: editMatForm.value.title.trim(),
        description: editMatForm.value.description.trim(),
        sort_order: Number(editMatForm.value.sort_order) || 0,
        status: editMatForm.value.status,
      });
    }
    showToast('物料信息已更新', 'success');
    editingMaterial.value = null;
    await loadMaterials();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新失败', 'error');
  } finally {
    savingMaterial.value = false;
  }
}

async function toggleMaterialStatus(m: MaterialItem) {
  const nextStatus: 0 | 1 = m.status === 1 ? 0 : 1;
  try {
    await updateAdminMaterial(m.id, { status: nextStatus });
    m.status = nextStatus;
    showToast(nextStatus === 1 ? '已上架' : '已下架', 'success');
  } catch (err) {
    showToast(err instanceof Error ? err.message : '状态切换失败', 'error');
  }
}

function askDeleteMaterial(m: MaterialItem) {
  confirmState.value = {
    open: true,
    title: '确认删除物料？',
    message: `即将删除物料「${m.title}」。\n若该物料已被历史客户选中，历史记录中仍会保留名称与缩略图快照，不影响订单查看。`,
    confirmText: '确认删除',
    danger: true,
    loading: false,
    onConfirm: async () => {
      await deleteAdminMaterial(m.id);
      showToast('物料已删除', 'success');
      await loadMaterials();
    },
  };
}

// ================= 客户访问码操作 =================
async function handleCreateCode() {
  const name = newClientForm.value.client_name.trim();
  if (!name) {
    showToast('请输入客户/合作方名称', 'error');
    return;
  }
  creatingCode.value = true;
  try {
    const res = await createAdminCode({
      client_name: name,
      max_select: Math.max(0, Number(newClientForm.value.max_select) || 0),
    });
    newClientForm.value.client_name = '';
    newClientForm.value.max_select = 0;
    await loadCodes();
    await copyText(buildClientLink(res.code.code), `客户直达链接 (${res.code.code})`);
  } catch (err) {
    showToast(err instanceof Error ? err.message : '生成失败', 'error');
  } finally {
    creatingCode.value = false;
  }
}

function openEditCode(c: AccessCodeItem) {
  editingCode.value = c;
  editCodeForm.value = {
    client_name: c.client_name,
    max_select: c.max_select,
  };
}

async function saveCodeEdit() {
  if (!editingCode.value) return;
  const name = editCodeForm.value.client_name.trim();
  if (!name) {
    showToast('客户名称不能为空', 'error');
    return;
  }
  savingCode.value = true;
  try {
    await updateAdminCode(editingCode.value.id, {
      client_name: name,
      max_select: Math.max(0, Number(editCodeForm.value.max_select) || 0),
    });
    showToast('客户名称备注已更新，原链接与口令不变', 'success');
    editingCode.value = null;
    await loadCodes();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新失败', 'error');
  } finally {
    savingCode.value = false;
  }
}

function askUnlockCode(c: AccessCodeItem) {
  confirmState.value = {
    open: true,
    title: '解锁重置选品状态？',
    message: `确定将「${c.client_name}」从“已确认”退回至“选图中”吗？\n解锁后，该客户原先选中的物料将自动恢复上架以便重新调整。`,
    confirmText: '确认解锁',
    danger: false,
    loading: false,
    onConfirm: async () => {
      await unlockAdminCode(c.id);
      showToast('已解锁并恢复相关物料上架', 'success');
      await loadAllData();
    },
  };
}

async function toggleCodeDisabled(c: AccessCodeItem) {
  const next: 0 | 1 = c.is_disabled === 1 ? 0 : 1;
  try {
    await updateAdminCode(c.id, { is_disabled: next });
    showToast(next === 1 ? '已禁用该访问码' : '已重新启用访问码', 'success');
    await loadCodes();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '操作失败', 'error');
  }
}

function askDeleteCode(c: AccessCodeItem) {
  confirmState.value = {
    open: true,
    title: '删除客户访问码？',
    message: `确定永久删除「${c.client_name} (${c.code})」及其选品记录吗？此操作不可撤销。`,
    confirmText: '确认删除',
    danger: true,
    loading: false,
    onConfirm: async () => {
      await deleteAdminCode(c.id);
      showToast('访问码已删除', 'success');
      if (viewingCode.value?.id === c.id) viewingCode.value = null;
      await loadCodes();
    },
  };
}

async function openViewSelections(c: AccessCodeItem) {
  viewingCode.value = c;
  viewingItems.value = [];
  loadingSelections.value = true;
  try {
    const res = await fetchCodeSelections(c.id);
    viewingCode.value = res.code;
    viewingItems.value = res.items;
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载选品清单失败', 'error');
  } finally {
    loadingSelections.value = false;
  }
}

function handleExportCsv() {
  if (!viewingCode.value || viewingItems.value.length === 0) return;
  exportSelectionsCsv(viewingCode.value.client_name, viewingCode.value.code, viewingItems.value);
  showToast('已导出 Excel/CSV 清单', 'success');
}

async function handleExportZip() {
  if (!viewingCode.value || viewingItems.value.length === 0 || zipProgress.value) return;
  zipProgress.value = { done: 0, total: viewingItems.value.length };
  try {
    const res = await downloadSelectionsZip(
      viewingCode.value.client_name,
      viewingCode.value.code,
      viewingItems.value,
      (done, total) => {
        zipProgress.value = { done, total };
      }
    );
    if (res.failedTitles.length > 0) {
      showToast(
        `已打包 ${res.successCount} 张，${res.failedTitles.length} 张下载失败`,
        'info'
      );
    } else {
      showToast(`已打包下载 ${res.successCount} 张重命名图片`, 'success');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '打包下载失败', 'error');
  } finally {
    zipProgress.value = null;
  }
}

async function executeConfirm() {
  if (!confirmState.value.onConfirm) return;
  confirmState.value.loading = true;
  try {
    await confirmState.value.onConfirm();
    confirmState.value.open = false;
  } catch (err) {
    showToast(err instanceof Error ? err.message : '操作失败', 'error');
  } finally {
    confirmState.value.loading = false;
  }
}

onMounted(async () => {
  const token = getAdminToken();
  if (!token) {
    checkingAuth.value = false;
    return;
  }
  try {
    await verifyAdminSession();
    isAuthenticated.value = true;
    await loadAllData();
  } catch {
    setAdminToken(null);
  } finally {
    checkingAuth.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- 验证中 -->
    <div v-if="checkingAuth" class="flex min-h-screen items-center justify-center text-sm text-slate-500">
      正在校验管理员登录状态...
    </div>

    <!-- 管理员登录页 -->
    <div
      v-else-if="!isAuthenticated"
      class="flex min-h-screen flex-col items-center justify-center px-4 py-10"
    >
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/70 ring-1 ring-slate-100">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Lock class="h-6 w-6" />
        </div>
        <h1 class="mt-4 text-center text-lg font-bold text-slate-900">管理后台登录</h1>
        <p class="mt-1 text-center text-xs text-slate-500">
          互换物料在线选品系统 · 管理员控制台
        </p>

        <form class="mt-6 space-y-4" @submit.prevent="handleLogin">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-700">管理员密码</label>
            <input
              v-model="loginPassword"
              type="password"
              autocomplete="current-password"
              placeholder="请输入管理员密码"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <p
            v-if="loginError"
            class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600"
          >
            {{ loginError }}
          </p>

          <button
            type="submit"
            :disabled="loginLoading"
            class="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {{ loginLoading ? '登录中...' : '进入管理后台' }}
          </button>
        </form>
      </div>
      <TechSupportFooter class="mt-4" />
    </div>

    <!-- 管理后台主界面 -->
    <div v-else class="pb-12">
      <!-- 顶部导航 -->
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Package class="h-5 w-5" />
            </div>
            <div>
              <h1 class="text-base font-bold text-slate-900">互换物料选品管理后台</h1>
              <p class="text-xs text-slate-500">
                物料 {{ materials.length }} 项 · 客户码 {{ codes.length }} 个
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <div class="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  activeTab === 'codes'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                "
                @click="activeTab = 'codes'"
              >
                <Users class="h-3.5 w-3.5" />
                <span>客户与访问码</span>
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  activeTab === 'materials'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                "
                @click="activeTab = 'materials'"
              >
                <Layers class="h-3.5 w-3.5" />
                <span>物料库管理</span>
              </button>
            </div>

            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="刷新数据"
              @click="loadAllData"
            >
              <RefreshCw class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              @click="handleLogout"
            >
              <LogOut class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 pt-5">
        <!-- ==================== Tab 1: 客户与访问码管理 ==================== -->
        <section v-if="activeTab === 'codes'" class="space-y-5">
          <!-- 新增客户/生成码卡片 -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900">
              <KeyRound class="h-4 w-4 text-indigo-600" />
              <span>新增客户 / 生成专属选品链接</span>
            </h2>
            <form
              class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12"
              @submit.prevent="handleCreateCode"
            >
              <div class="sm:col-span-6">
                <label class="mb-1 block text-xs text-slate-500">客户 / 合作方名称（必填）</label>
                <input
                  v-model="newClientForm.client_name"
                  type="text"
                  placeholder="如：小红书-林小美、XX品牌-王总"
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div class="sm:col-span-3">
                <label class="mb-1 block text-xs text-slate-500">最大可选数量（0 不限）</label>
                <input
                  v-model.number="newClientForm.max_select"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div class="flex items-end sm:col-span-3">
                <button
                  type="submit"
                  :disabled="creatingCode"
                  class="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus class="h-4 w-4" />
                  <span>{{ creatingCode ? '生成中...' : '生成并复制链接' }}</span>
                </button>
              </div>
            </form>
          </div>

          <!-- 搜索栏 -->
          <div class="flex items-center justify-between gap-3">
            <div class="relative w-full max-w-sm">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                v-model="codeSearch"
                type="search"
                placeholder="搜索客户名称或 6 位访问码..."
                class="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <span class="text-xs text-slate-500">共 {{ filteredCodes.length }} 条</span>
          </div>

          <!-- 客户看板列表 -->
          <div v-if="codesLoading" class="py-12 text-center text-sm text-slate-400">
            加载中...
          </div>
          <div
            v-else-if="filteredCodes.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-400"
          >
            暂无客户访问码记录，请在上方输入客户名称生成
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="c in filteredCodes"
              :key="c.id"
              class="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center"
            >
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 text-left text-base font-bold text-slate-900 hover:text-indigo-600"
                    title="点击修改客户名称备注"
                    @click="openEditCode(c)"
                  >
                    <span>{{ c.client_name }}</span>
                    <Edit3 class="h-3.5 w-3.5 text-slate-400" />
                  </button>

                  <span
                    class="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                    :class="getCodeStatusMeta(c.status, c.is_disabled).badgeClass"
                  >
                    {{ getCodeStatusMeta(c.status, c.is_disabled).label }}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span class="inline-flex items-center gap-1">
                    访问码：
                    <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-slate-800">
                      {{ c.code }}
                    </code>
                  </span>
                  <span>
                    已选：<strong class="text-slate-800">{{ c.selected_count ?? 0 }}</strong>
                    {{ c.max_select > 0 ? `/ ${c.max_select} 项` : '项（不限）' }}
                  </span>
                  <span v-if="c.submitted_at">
                    确认时间：{{ formatDateTime(c.submitted_at) }}
                  </span>
                  <span v-else>
                    创建于：{{ formatDateTime(c.created_at) }}
                  </span>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  @click="copyText(c.code, '6位访问码')"
                >
                  <Copy class="h-3.5 w-3.5" />
                  <span>复制口令</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  @click="copyText(buildClientLink(c.code), '直达链接')"
                >
                  <LinkIcon class="h-3.5 w-3.5" />
                  <span>复制链接</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  @click="openViewSelections(c)"
                >
                  <Eye class="h-3.5 w-3.5" />
                  <span>查看选品</span>
                </button>
                <button
                  v-if="c.status === 2"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  @click="askUnlockCode(c)"
                >
                  <Unlock class="h-3.5 w-3.5" />
                  <span>解锁重置</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  :title="c.is_disabled === 1 ? '重新启用' : '禁用此访问码'"
                  @click="toggleCodeDisabled(c)"
                >
                  <ShieldAlert class="h-3.5 w-3.5" />
                  <span>{{ c.is_disabled === 1 ? '启用' : '禁用' }}</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  @click="askDeleteCode(c)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ==================== Tab 2: 物料库管理 ==================== -->
        <section v-else class="space-y-5">
          <!-- 存储空间配额条（控制 Cloudflare R2 10GB 免费额度内） -->
          <div
            v-if="storageQuota"
            class="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-semibold text-slate-700">R2 图片存储配额</span>
              <span class="text-slate-500">
                已用 <strong class="text-slate-900">{{ formatBytes(storageQuota.usedBytes) }}</strong>
                / 上限 {{ formatBytes(storageQuota.maxBytes) }}
                （{{ storagePercent.toFixed(2) }}%）
              </span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-56">
              <div
                class="h-full rounded-full transition-all"
                :class="
                  storagePercent >= 90
                    ? 'bg-rose-500'
                    : storagePercent >= 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                "
                :style="{ width: `${Math.max(storageQuota.usedBytes > 0 ? 2 : 0, storagePercent)}%` }"
              />
            </div>
          </div>

          <!-- 工具栏 -->
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
              <div class="relative w-full sm:w-64">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  v-model="materialSearch"
                  type="search"
                  placeholder="搜索物料名称/描述..."
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div class="flex rounded-xl bg-slate-100 p-1 text-xs font-medium">
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1.5 transition"
                  :class="materialStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'"
                  @click="materialStatusFilter = 'all'"
                >
                  全部
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1.5 transition"
                  :class="materialStatusFilter === '1' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'"
                  @click="materialStatusFilter = '1'"
                >
                  已上架
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1.5 transition"
                  :class="materialStatusFilter === '0' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'"
                  @click="materialStatusFilter = '0'"
                >
                  已下架
                </button>
              </div>
            </div>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              @click="uploadModalOpen = true"
            >
              <Upload class="h-4 w-4" />
              <span>批量上传物料</span>
            </button>
          </div>

          <!-- 物料网格 -->
          <div v-if="materialsLoading" class="py-12 text-center text-sm text-slate-400">
            加载中...
          </div>
          <div
            v-else-if="filteredMaterials.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400"
          >
            暂无物料，点击右上角「批量上传物料」添加
          </div>
          <div
            v-else
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <article
              v-for="m in filteredMaterials"
              :key="m.id"
              class="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div class="relative aspect-square bg-slate-100">
                <img
                  :src="m.image_url"
                  :alt="m.title"
                  loading="lazy"
                  class="h-full w-full object-cover"
                  :class="m.status === 0 ? 'opacity-50 grayscale' : ''"
                />
                <div class="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                  <span
                    class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm"
                    :class="
                      m.status === 1
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-white'
                    "
                  >
                    {{ m.status === 1 ? '已上架' : '已下架' }}
                  </span>
                  <span class="rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                    {{ formatBytes(m.file_size) }}
                  </span>
                </div>
                <span class="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm">
                  排序 {{ m.sort_order }}
                </span>
              </div>

              <div class="flex flex-1 flex-col p-3.5">
                <h3 class="line-clamp-1 text-sm font-bold text-slate-900">{{ m.title }}</h3>
                <p class="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-slate-500">
                  {{ m.description || '暂无描述' }}
                </p>

                <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span class="text-[11px] text-slate-400">
                    被选 {{ m.selection_count ?? 0 }} 次
                  </span>

                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      class="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      @click="toggleMaterialStatus(m)"
                    >
                      <EyeOff v-if="m.status === 1" class="inline h-3.5 w-3.5 mr-0.5" />
                      <Check v-else class="inline h-3.5 w-3.5 mr-0.5" />
                      {{ m.status === 1 ? '下架' : '上架' }}
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                      title="编辑物料"
                      @click="openEditMaterial(m)"
                    >
                      <Edit3 class="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                      title="删除物料"
                      @click="askDeleteMaterial(m)"
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <TechSupportFooter class="mt-6" />
      </main>

      <!-- 批量上传弹窗 -->
      <BatchUploadModal
        :open="uploadModalOpen"
        :default-sort-base="maxSortOrder"
        @close="uploadModalOpen = false"
        @uploaded="loadMaterials"
      />

      <!-- 编辑物料弹窗 -->
      <Teleport to="body">
        <div
          v-if="editingMaterial"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          @click.self="!savingMaterial && (editingMaterial = null)"
        >
          <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-slate-900">编辑物料信息</h3>
              <button
                type="button"
                class="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                @click="editingMaterial = null"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <form class="mt-4 space-y-3.5" @submit.prevent="saveMaterialEdit">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-700">物料名称</label>
                <input
                  v-model="editMatForm.title"
                  type="text"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-700">详细描述</label>
                <textarea
                  v-model="editMatForm.description"
                  rows="3"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-700">排序权重（小靠前）</label>
                  <input
                    v-model.number="editMatForm.sort_order"
                    type="number"
                    class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-700">上架状态</label>
                  <select
                    v-model.number="editMatForm.status"
                    class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option :value="1">已上架（客户可见）</option>
                    <option :value="0">已下架（客户不可见）</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-700">替换图片（选填，自动压缩 &lt; 500KB）</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                  @change="handleEditMaterialFile"
                />
                <p v-if="editMatCompressInfo" class="mt-1 text-xs text-emerald-600">
                  {{ editMatCompressInfo }}
                </p>
              </div>

              <div class="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  :disabled="savingMaterial"
                  class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  @click="editingMaterial = null"
                >
                  取消
                </button>
                <button
                  type="submit"
                  :disabled="savingMaterial"
                  class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {{ savingMaterial ? '保存中...' : '保存修改' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Teleport>

      <!-- 修改客户名称备注弹窗 -->
      <Teleport to="body">
        <div
          v-if="editingCode"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          @click.self="!savingCode && (editingCode = null)"
        >
          <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 class="text-base font-bold text-slate-900">修改客户名称与限选数</h3>
            <p class="mt-1 text-xs text-slate-500">
              访问码 <code class="font-mono font-bold text-slate-800">{{ editingCode.code }}</code> 及已生成链接保持不变
            </p>
            <form class="mt-4 space-y-3.5" @submit.prevent="saveCodeEdit">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-700">客户名称</label>
                <input
                  v-model="editCodeForm.client_name"
                  type="text"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-700">最大可选数量（0 表示不限制）</label>
                <input
                  v-model.number="editCodeForm.max_select"
                  type="number"
                  min="0"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  :disabled="savingCode"
                  class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  @click="editingCode = null"
                >
                  取消
                </button>
                <button
                  type="submit"
                  :disabled="savingCode"
                  class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {{ savingCode ? '保存中...' : '保存修改' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Teleport>

      <!-- 查看客户选品结果与导出弹窗 -->
      <Teleport to="body">
        <div
          v-if="viewingCode"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-sm"
          @click.self="viewingCode = null"
        >
          <div class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-bold text-slate-900">
                    {{ viewingCode.client_name }} 的选品清单
                  </h3>
                  <span
                    class="rounded-full border px-2 py-0.5 text-xs font-semibold"
                    :class="getCodeStatusMeta(viewingCode.status, viewingCode.is_disabled).badgeClass"
                  >
                    {{ getCodeStatusMeta(viewingCode.status, viewingCode.is_disabled).label }}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-slate-500">
                  访问码：{{ viewingCode.code }} · 共 {{ viewingItems.length }} 项
                  <template v-if="viewingCode.submitted_at">
                    · 确认于 {{ formatDateTime(viewingCode.submitted_at) }}
                  </template>
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  :disabled="viewingItems.length === 0"
                  class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
                  @click="handleExportCsv"
                >
                  <FileSpreadsheet class="h-4 w-4" />
                  <span>导出 Excel/CSV</span>
                </button>
                <button
                  type="button"
                  :disabled="viewingItems.length === 0 || zipProgress !== null"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                  @click="handleExportZip"
                >
                  <Archive class="h-4 w-4" />
                  <span v-if="zipProgress">
                    打包中 {{ zipProgress.done }}/{{ zipProgress.total }}...
                  </span>
                  <span v-else>打包下载图片 (ZIP)</span>
                </button>
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                  @click="viewingCode = null"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-5">
              <div v-if="loadingSelections" class="py-12 text-center text-sm text-slate-400">
                正在读取选品记录...
              </div>
              <div
                v-else-if="viewingItems.length === 0"
                class="py-12 text-center text-sm text-slate-400"
              >
                该客户暂未勾选任何物料
              </div>
              <div v-else class="divide-y divide-slate-100">
                <div
                  v-for="(item, idx) in viewingItems"
                  :key="item.selection_id"
                  class="flex items-start gap-3.5 py-3 first:pt-0 last:pb-0"
                >
                  <span class="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-slate-400">
                    {{ idx + 1 }}
                  </span>
                  <img
                    :src="item.image_url"
                    :alt="item.title"
                    class="h-16 w-16 shrink-0 rounded-xl border border-slate-200 bg-slate-50 object-cover"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="text-sm font-semibold text-slate-900">{{ item.title }}</h4>
                      <span
                        v-if="item.is_deleted"
                        class="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                      >
                        原物料已删除(快照)
                      </span>
                      <span
                        v-else-if="item.material_status === 0"
                        class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        已下架
                      </span>
                    </div>
                    <p class="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                      {{ item.description || '暂无描述' }}
                    </p>
                    <p class="mt-1 text-[11px] text-slate-400">
                      选中时间：{{ formatDateTime(item.selected_at) }}
                      <template v-if="item.file_size"> · {{ formatBytes(item.file_size) }}</template>
                    </p>
                  </div>
                  <a
                    :href="item.image_url"
                    :download="item.title"
                    target="_blank"
                    class="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    title="下载单张原图"
                  >
                    <Download class="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 全局二次确认弹窗 -->
      <ConfirmModal
        :open="confirmState.open"
        :title="confirmState.title"
        :message="confirmState.message"
        :confirm-text="confirmState.confirmText"
        :danger="confirmState.danger"
        :loading="confirmState.loading"
        @cancel="confirmState.open = false"
        @confirm="executeConfirm"
      />
    </div>
  </div>
</template>
