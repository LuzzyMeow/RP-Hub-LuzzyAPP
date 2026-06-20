/**
 * Store 统一导出
 *
 * 所有 slice 已组合到 app-store.ts 的 useAppStore 中，
 * 通过别名导出兼容旧代码（useSettingsStore / useChatStore 等）。
 */
export {
  useAppStore,
  useClockStore,
  useChatInputStore,
  useSettingsStore,
  useChatStore,
  useCharacterStore,
  useUIStore,
} from "~/stores/app-store";

export type {
  AppStoreState,
  ChatInputSlice,
  ClockSlice,
  Draft,
  SettingsSlice,
  CharacterSlice,
  ChatSlice,
  UISlice,
} from "~/stores/slices/types";
