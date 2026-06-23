/**
 * TRPG 页面
 *
 * v0.3.0 变更：
 * - iframe 提升为全局组件（GlobalTrpgIframe），在 root.tsx 中渲染
 * - 本页面仅提供布局外壳（header + 说明弹窗），iframe 由全局组件 display 控制
 * - 切换页面再切回时 iframe 不重新加载，状态保持
 *
 * v0.2.0 功能：
 * - 代理无感知化：移除代理配置弹窗，改为说明弹窗
 * - 弹窗提示：TRPG 模式使用全局自定义供应商 API
 * - 图标迁移至 game-icon-pack
 */

import * as React from "react";
import type { Route } from "./+types/trpg";
import { IconLink, IconInfo } from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "~/components/ui/dialog";
import { pressableSubtle } from "~/lib/motion-presets";

export function meta(_: Route.MetaArgs) {
  return [{ title: "TRPG - LUZZY" }];
}

const TRPG_IFRAME_URL = "https://aisandboxgame.com/";

export default function TrpgPage() {
  const trpgNoticeDismissed = useAppStore((s) => s.trpgNoticeDismissed);
  const setTrpgNoticeDismissed = useAppStore((s) => s.setTrpgNoticeDismissed);

  // 自动弹出：进入页面时若未永久关闭则显示说明
  const [showNotice, setShowNotice] = React.useState(false);

  React.useEffect(() => {
    if (!trpgNoticeDismissed) {
      setShowNotice(true);
    }
  }, [trpgNoticeDismissed]);

  /** 手动打开说明（通过 Header 信息按钮） */
  const openNotice = React.useCallback(() => {
    setShowNotice(true);
  }, []);

  /** 仅本次关闭（下次进入仍会弹出） */
  const handleClose = React.useCallback(() => {
    setShowNotice(false);
  }, []);

  /** 永久关闭（不再自动弹出，可通过信息按钮手动查看） */
  const handleDismissForever = React.useCallback(() => {
    setTrpgNoticeDismissed(true);
    setShowNotice(false);
  }, [setTrpgNoticeDismissed]);

  return (
    <LuzzyLayout
      title="TRPG"
      actions={
        <>
          <Button variant="ghost" size="icon" asChild {...pressableSubtle}>
            <a
              href={TRPG_IFRAME_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在新窗口打开"
            >
              <IconLink className="size-4" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openNotice}
            aria-label="TRPG 说明"
            {...pressableSubtle}
          >
            <IconInfo className="size-4" />
          </Button>
        </>
      }
      contentClassName="!overflow-hidden"
    >
      {/* v0.3.0: iframe 已提升为全局组件 GlobalTrpgIframe，在 root.tsx 中渲染 */}
      {/* 本页面 main 内容区留空，全局 iframe 通过 fixed 定位填满此区域 */}

      {/* TRPG 模式说明弹窗 */}
      <Dialog open={showNotice} onOpenChange={setShowNotice}>
        {/* v0.4.6: overflow-y-auto 替代 overflow-hidden,避免 flex 布局在 Android WebView 上因 dvh 计算偏差导致 footer 与文字重叠 */}
        <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto max-w-md flex flex-col gap-0">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <IconInfo className="size-5 text-primary" />
              TRPG 模式说明
            </DialogTitle>
            <DialogDescription>
              了解 TRPG 模式如何配置 API 服务
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-2 pr-2">
            <div className="space-y-3 text-sm leading-relaxed">
              {/* v0.4.2: 重写说明弹窗,明确支持三种 API 配置场景 */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="font-medium text-foreground">工作原理</p>
                <ul className="mt-2 space-y-1.5 text-muted-foreground">
                  <li>
                    • TRPG 模式会使用你在
                    <span className="font-medium text-foreground">设置页面</span>
                    配置的
                    <span className="font-medium text-foreground">自定义供应商</span>
                    进行 API 请求。
                  </li>
                  <li>
                    • 仅识别
                    <span className="font-medium text-foreground">自定义供应商</span>
                    的模型名称，其他内置供应商不会被调用。
                  </li>
                  <li>
                    • 真正起作用的是自定义供应商的
                    <span className="font-medium text-foreground">模型名称</span>
                    ，请确保已正确填写。
                  </li>
                </ul>
              </div>

              {/* 场景一:火山方舟编码计划(自动转发) */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold">1</span>
                  场景一：火山方舟编码计划（自动转发）
                </p>
                <ol className="mt-2 space-y-1 text-muted-foreground">
                  <li>1. 前往 <span className="font-medium text-foreground">设置 → API 连接与服务</span></li>
                  <li>2. 新增一个自定义供应商</li>
                  <li>3. 填写火山方舟编码计划的模型名称（如 doubao-...）</li>
                  <li>4. API 地址填占位符（如 <code className="text-xs bg-muted/50 px-1 rounded">http://localhost:18527/v3</code>）</li>
                  <li>5. API Key 填占位符，由本地代理自动注入</li>
                  <li>6. 返回 TRPG 页面即可开始游戏</li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  提示：本地代理服务器运行于 localhost:18527，检测到 /v3 前缀自动转发至火山方舟 API（ark.cn-beijing.volces.com/api/coding/v3）。
                </p>
              </div>

              {/* 场景二:其他供应商需转发 */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold">2</span>
                  场景二：其他供应商需转发（绕过 CORS）
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  适用：供应商 API 不支持 CORS，或 Android WebView 无法直接访问的场景。
                </p>
                <ol className="mt-2 space-y-1 text-muted-foreground">
                  <li>1. 前往 <span className="font-medium text-foreground">设置 → API 连接与服务</span></li>
                  <li>2. 新增自定义供应商，填写真实 API 地址与 Key</li>
                  <li>3. 在 TRPG 网页内配置 API 地址为：</li>
                </ol>
                <div className="mt-1.5 rounded bg-muted/50 p-2 text-xs">
                  <code className="break-all">http://localhost:18527/v1?_target=https://你的供应商地址</code>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  示例：DeepSeek → <code className="text-xs bg-muted/50 px-1 rounded">http://localhost:18527/v1?_target=https://api.deepseek.com</code>
                </p>
              </div>

              {/* 场景三:其他供应商无需转发 */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold">3</span>
                  场景三：其他供应商无需转发（直连）
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  适用：供应商 API 支持 CORS，或在浏览器（Web 版）运行 TRPG 模式。
                </p>
                <ol className="mt-2 space-y-1 text-muted-foreground">
                  <li>1. 前往 <span className="font-medium text-foreground">设置 → API 连接与服务</span></li>
                  <li>2. 新增自定义供应商，填写真实 API 地址与 Key</li>
                  <li>3. 在 TRPG 网页内直接填写供应商的真实 API 地址</li>
                  <li>4. 无需通过 localhost:18527 代理</li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  注意：Android WebView 内 iframe 默认走本地代理；若供应商支持 CORS，可在 TRPG 网页内直接配置真实地址绕过代理。
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 shrink-0 pt-3 border-t border-border/40">
            <Button variant="outline" onClick={handleDismissForever}>
              不再提示
            </Button>
            <Button onClick={handleClose}>我已了解</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}
