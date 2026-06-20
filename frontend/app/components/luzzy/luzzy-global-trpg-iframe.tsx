/**
 * 全局 TRPG iframe 组件（v0.3.0 新增）
 *
 * 将 TRPG iframe 提升为全局组件，使用 display:none/block 控制显隐，
 * 避免路由切换时 iframe 重新加载导致状态丢失。
 *
 * 定位说明：
 * - top: 位于 AppHeader 下方（header 高度 = 2.75rem + safe-area-inset-top）
 * - left: 移动端为 0（侧边栏为 overlay），桌面端为 15rem（w-60 桌面侧边栏宽度）
 * - right/bottom: 0（填满剩余空间）
 * - z-index: 30（高于布局背景，低于 header/sidebar 的 z-40+）
 */

import * as React from "react";
import { useLocation } from "react-router";

const TRPG_IFRAME_URL = "https://aisandboxgame.com/";

export function GlobalTrpgIframe() {
  const location = useLocation();
  const isTrpgRoute = location.pathname.startsWith("/trpg");
  // 仅在首次访问时记录 src 已设置，避免后续切换重新加载
  const [srcSet, setSrcSet] = React.useState(false);

  React.useEffect(() => {
    // 首次进入 TRPG 页面时标记 src 已设置
    if (isTrpgRoute && !srcSet) {
      setSrcSet(true);
    }
  }, [isTrpgRoute, srcSet]);

  return (
    <div
      className="fixed bottom-0 right-0 left-0 top-[calc(2.75rem+env(safe-area-inset-top))] z-30 md:left-60"
      style={{ display: isTrpgRoute ? "block" : "none" }}
      aria-hidden={!isTrpgRoute}
    >
      {srcSet && (
        <iframe
          src={TRPG_IFRAME_URL}
          title="TRPG Sandbox"
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
