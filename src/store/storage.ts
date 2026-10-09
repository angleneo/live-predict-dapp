import { useEffect, useState } from 'react';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** SSR 安全的存储适配：服务端渲染时退化为 no-op，避免 localStorage 未定义 */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const safeLocalStorage = (): StateStorage => {
  if (typeof window === 'undefined') return noopStorage;
  try {
    const probe = '__probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // 隐私模式 / 存储被禁用时不要让整页崩掉
    return noopStorage;
  }
};

export const createSafeJSONStorage = <T>() => createJSONStorage<T>(() => safeLocalStorage());

/** 客户端 hydration 完成标志：持久化状态要等它之后再用，避免水合不一致 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
