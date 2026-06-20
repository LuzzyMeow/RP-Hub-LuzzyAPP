/**
 * UI Slice（Zustand slice）
 *
 * 管理侧边菜单的开/关状态。
 *
 * 从 .luzzy-backup/store/useUIStore.ts 迁移，适配 slices 组合模式。
 */

import type { StateCreator } from "zustand";

import type { AppStoreState, UISlice } from "~/stores/slices/types";

export const createUISlice: StateCreator<
  AppStoreState,
  [],
  [],
  UISlice
> = (set) => ({
  sideMenuOpen: false,
  toggleSideMenu: () => set((s) => ({ sideMenuOpen: !s.sideMenuOpen })),
  setSideMenuOpen: (open) => set({ sideMenuOpen: open }),
});
