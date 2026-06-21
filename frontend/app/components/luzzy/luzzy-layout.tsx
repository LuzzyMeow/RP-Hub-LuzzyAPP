/**
 * LUZZY 布局组件
 *
 * 包含侧边栏 + 主内容区 + 顶部 AppHeader
 * 每个页面通过此布局包裹
 */

import * as React from "react";
import { IconMenu } from "~/components/luzzy/luzzy-icons";

import { cn } from "~/lib/utils";
import { useUIStore } from "~/stores";
import { Button } from "~/components/ui/button";
import { LuzzySidebar } from "~/components/luzzy/luzzy-sidebar";

interface LuzzyLayoutProps {
  children: React.ReactNode;
  /** 页面标题 */
  title?: string;
  /** 右侧操作按钮区 */
  actions?: React.ReactNode;
  /** 是否显示侧边栏（默认 true） */
  showSidebar?: boolean;
  /** 主内容区额外样式 */
  contentClassName?: string;
}

/** 顶部应用栏 */
function AppHeader({
  title,
  actions,
  onMenuClick,
}: {
  title?: string;
  actions?: React.ReactNode;
  onMenuClick?: () => void;
}) {
  return (
    <header
      className="relative flex shrink-0 items-center gap-2 border-b border-border/20 bg-background/40 px-4 backdrop-blur-xl backdrop-saturate-150"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        height: "calc(2.75rem + env(safe-area-inset-top))",
      }}
    >
      {/* 顶部渐变光晕（液态玻璃质感增强） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {/* 菜单按钮（仅移动端显示） */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
      >
        <IconMenu className="size-5" />
      </Button>
      {/* 标题 */}
      {title && (
        <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      )}
      {/* 右侧操作区 */}
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}

/** LUZZY 布局 */
export function LuzzyLayout({
  children,
  title,
  actions,
  showSidebar = true,
  contentClassName,
}: LuzzyLayoutProps) {
  const toggleSideMenu = useUIStore((state) => state.toggleSideMenu);

  return (
    <div className="flex h-screen w-full max-w-[100vw] overflow-hidden bg-background">
      {/* 侧边栏（LuzzySidebar 内部根据 useIsMobile 决定渲染方式） */}
      {showSidebar && <LuzzySidebar />}

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader title={title} actions={actions} onMenuClick={toggleSideMenu} />
        <main
          className={cn(
            "flex-1 overflow-hidden min-h-0 min-w-0",
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
