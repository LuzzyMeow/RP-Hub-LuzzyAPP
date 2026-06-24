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
import { IconLink, IconInfo, IconExclamation } from "~/components/luzzy/luzzy-icons";

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
              {/* 核心提示：必须使用代理 */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <IconExclamation className="size-4" />
                  重要提示
                </p>
                <p className="mt-1.5 text-foreground">
                  TRPG 模式<strong>必须通过本地代理</strong>才能正常工作（解决 Android WebView CORS 限制与火山方舟自动注入问题）。
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  本地代理地址：<code className="bg-muted/50 px-1 rounded">http://localhost:18527</code>（应用启动时自动运行）
                </p>
              </div>

              {/* 配置说明 */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="font-medium text-foreground">快速配置</p>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  <li>
                    <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold mr-1.5">1</span>
                    前往 <span className="font-medium text-foreground">设置 → API 连接与服务</span>，新增一个<strong>自定义供应商</strong>
                  </li>
                  <li>
                    <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold mr-1.5">2</span>
                    根据你使用的模型，填写对应的 API 地址（见下方两种场景）
                  </li>
                  <li>
                    <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold mr-1.5">3</span>
                    在 TRPG 网页内选择该模型即可开始游戏
                  </li>
                </ul>
              </div>

              {/* 场景一：火山方舟编码计划 */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold">A</span>
                  使用火山方舟编码计划模型
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  适用于 doubao 等火山方舟编码计划模型，API Key 由代理自动注入
                </p>
                <div className="mt-2 space-y-1.5">
                  <div>
                    <span className="text-xs font-medium text-foreground">API 地址填写：</span>
                    <div className="mt-0.5 rounded bg-muted/50 p-2 text-xs font-mono break-all">
                      http://localhost:18527/v3
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">API Key：</span>
                    <span className="text-xs text-muted-foreground ml-1">随意填写（代理自动注入真实 Key）</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">模型名称：</span>
                    <span className="text-xs text-muted-foreground ml-1">填写火山方舟模型名（如 doubao-1.5-pro-32k）</span>
                  </div>
                </div>
              </div>

              {/* 场景二：其他供应商 */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold">B</span>
                  使用其他供应商（DeepSeek、GPT、Claude 等）
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  适用于所有需要绕过 CORS 的第三方 API，代理会转发请求
                </p>
                <div className="mt-2 space-y-1.5">
                  <div>
                    <span className="text-xs font-medium text-foreground">API 地址填写：</span>
                    <div className="mt-0.5 rounded bg-muted/50 p-2 text-xs font-mono break-all">
                      http://localhost:18527/v1?_target=你的真实API地址
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    示例（DeepSeek）：
                    <code className="bg-muted/50 px-1 rounded ml-1 break-all">http://localhost:18527/v1?_target=https://api.deepseek.com/v1</code>
                  </p>
                  <div>
                    <span className="text-xs font-medium text-foreground">API Key：</span>
                    <span className="text-xs text-muted-foreground ml-1">填写该供应商的真实 API Key</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">模型名称：</span>
                    <span className="text-xs text-muted-foreground ml-1">填写该供应商支持的模型名</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                💡 提示：TRPG 模式仅识别<strong>自定义供应商</strong>的模型，内置供应商（如官方豆包、DeepSeek 内置配置）不会被调用。
              </p>
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
