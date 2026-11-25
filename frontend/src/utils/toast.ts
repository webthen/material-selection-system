import { reactive } from 'vue';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
}

export const toastState = reactive<{ items: ToastMessage[] }>({
  items: [],
});

let nextId = 1;

export function showToast(
  text: string,
  type: 'info' | 'success' | 'error' = 'info',
  durationMs = 2600
): void {
  const id = nextId++;
  toastState.items.push({ id, text, type });
  setTimeout(() => {
    const idx = toastState.items.findIndex((t) => t.id === id);
    if (idx !== -1) toastState.items.splice(idx, 1);
  }, durationMs);
}
