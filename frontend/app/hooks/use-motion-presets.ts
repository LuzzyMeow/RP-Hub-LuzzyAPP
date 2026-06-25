/**
 * useMotionPresets — 根据当前配色方案返回对应的动画预设集合
 *
 * pixel 主题返回像素风格预设，default 主题返回标准预设。
 * 用法：const { springEnter, pressable, fadeSlide } = useMotionPresets();
 */
import { useAppStore } from "~/stores";
import {
  springEnter,
  scaleIn,
  slideInRight,
  slideOutLeft,
  slideInBottom,
  fadeSlide,
  fadeIn,
  pressable,
  pressableSubtle,
  glassHover,
  cardAnimation,
  buttonAnimation,
  iconButtonAnimation,
  listItemAnimation,
  overlayAnimation,
} from "~/lib/motion-presets";
import {
  pixelSpringEnter,
  pixelScaleIn,
  pixelSlideInRight,
  pixelSlideInBottom,
  pixelFadeSlide,
  pixelFadeIn,
  pixelPressable,
  pixelPressableSubtle,
  pixelGlassHover,
  pixelCardAnimation,
  pixelButtonAnimation,
  pixelIconButtonAnimation,
  pixelListItemAnimation,
  pixelOverlayAnimation,
} from "~/lib/motion-presets";

const defaultPresets = {
  springEnter,
  scaleIn,
  slideInRight,
  slideOutLeft,
  slideInBottom,
  fadeSlide,
  fadeIn,
  pressable,
  pressableSubtle,
  glassHover,
  cardAnimation,
  buttonAnimation,
  iconButtonAnimation,
  listItemAnimation,
  overlayAnimation,
};

const pixelPresets = {
  springEnter: pixelSpringEnter,
  scaleIn: pixelScaleIn,
  slideInRight: pixelSlideInRight,
  slideOutLeft: pixelSlideInRight,
  slideInBottom: pixelSlideInBottom,
  fadeSlide: pixelFadeSlide,
  fadeIn: pixelFadeIn,
  pressable: pixelPressable,
  pressableSubtle: pixelPressableSubtle,
  glassHover: pixelGlassHover,
  cardAnimation: pixelCardAnimation,
  buttonAnimation: pixelButtonAnimation,
  iconButtonAnimation: pixelIconButtonAnimation,
  listItemAnimation: pixelListItemAnimation,
  overlayAnimation: pixelOverlayAnimation,
};

export function useMotionPresets() {
  const colorScheme = useAppStore((s) => s.colorScheme);
  return colorScheme === "pixel" ? pixelPresets : defaultPresets;
}
