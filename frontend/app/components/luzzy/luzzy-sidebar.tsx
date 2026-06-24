/**
 * LUZZY 侧边导航组件
 *
 * 菜单分 3 组（主功能 / AI 配置 / 个人）+ spring 动画滑入 + 遮罩层淡入淡出
 * 移动端全屏抽屉，桌面端固定侧栏
 */

import * as React from "react";
import { NavLink } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  IconMessage,
  IconCharacter,
  IconDice,
  IconToolKit,
  IconLight,
  IconDocument,
  IconBook,
  IconCode,
  IconGrid,
  IconSettings,
  IconUser,
  IconFolder,
  IconClose,
  IconInfo,
} from "~/components/luzzy/luzzy-icons";

import { cn } from "~/lib/utils";
import { useUIStore } from "~/stores";
import { useIsMobile } from "~/hooks/use-mobile";
import { Button } from "~/components/ui/button";

/** 菜单项定义 */
interface MenuItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** 菜单分组定义 */
interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/** 菜单分组（主功能 / AI 配置 / 个人） */
const MENU_GROUPS: MenuGroup[] = [
  {
    label: "主功能",
    items: [
      { to: "/", label: "聊天", icon: IconMessage },
      { to: "/characters", label: "角色卡", icon: IconCharacter },
      { to: "/trpg", label: "TRPG", icon: IconDice },
      { to: "/tools", label: "工具", icon: IconToolKit },
    ],
  },
  {
    label: "AI 配置",
    items: [
      { to: "/memory", label: "记忆", icon: IconLight },
      { to: "/preset", label: "预设", icon: IconDocument },
      { to: "/world-info", label: "世界书", icon: IconBook },
      { to: "/knowledge-base", label: "知识库", icon: IconFolder },
      { to: "/regex", label: "正则脚本", icon: IconCode },
      { to: "/ui-template", label: "UI模板", icon: IconGrid },
    ],
  },
  {
    label: "个人",
    items: [
      { to: "/profile", label: "用户档案", icon: IconUser },
      { to: "/settings", label: "设置", icon: IconSettings },
      { to: "/about", label: "关于", icon: IconInfo },
    ],
  },
];

/** 侧边栏内容 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {/* 菜单分组列表 */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {MENU_GROUPS.map((group, groupIndex) => {
          // 计算该组之前所有项目的数量，用于动画延迟连续递增
          const prevCount = MENU_GROUPS.slice(0, groupIndex).reduce(
            (sum, g) => sum + g.items.length,
            0,
          );
          return (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/60">
                {group.label}
              </div>
              {group.items.map((item, itemIndex) => {
                const Icon = item.icon;
                const animIndex = prevCount + itemIndex;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0, willChange: "transform, opacity" }}
                    transition={{
                      delay: animIndex * 0.04,
                      type: "spring",
                      stiffness: 300,
                      damping: 24,
                    }}
                  >
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          "hover:bg-accent hover:text-accent-foreground",
                          "active:scale-[0.98]",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground",
                        )
                      }
                    >
                      <Icon className="size-5 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** 移动端抽屉式侧边栏 */
function MobileSidebar() {
  const sideMenuOpen = useUIStore((state) => state.sideMenuOpen);
  const setSideMenuOpen = useUIStore((state) => state.setSideMenuOpen);

  return (
    <AnimatePresence>
      {sideMenuOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, willChange: "opacity" }}
            exit={{ opacity: 0, willChange: "opacity" }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setSideMenuOpen(false)}
          />
          {/* 侧边栏 */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0, willChange: "transform" }}
            exit={{ x: "-100%", willChange: "transform" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <span className="text-lg font-bold">LUZZY</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setSideMenuOpen(false)}>
                <IconClose className="size-4" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setSideMenuOpen(false)} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** 桌面端固定侧边栏 */
function DesktopSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:block">
      <div className="flex items-center border-b px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="text-lg font-bold">LUZZY</span>
      </div>
      <SidebarContent />
    </aside>
  );
}

/** 侧边导航入口组件 */
export function LuzzySidebar() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileSidebar /> : <DesktopSidebar />;
}
