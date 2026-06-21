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
import { motion } from "motion/react";
import { IconLink, IconInfo } from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
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
        <DialogContent className="min-w-0 overflow-hidden max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <IconInfo className="size-5 text-primary" />
              </motion.span>
              TRPG 模式说明
            </DialogTitle>
            <DialogDescription>
              了解 TRPG 模式如何使用 API 服务
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-3 py-2 pr-2 text-sm leading-relaxed"
            >
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
                    • 自定义供应商的
                    <span className="font-medium text-foreground">API 地址</span>
                    和
                    <span className="font-medium text-foreground">API Key</span>
                    字段为占位符，实际请求由本地代理服务器转发。
                  </li>
                  <li>
                    • 真正起作用的是自定义供应商的
                    <span className="font-medium text-foreground">模型名称</span>
                    ，请确保已正确填写。
                  </li>
                </ul>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium text-foreground">使用步骤</p>
                <ol className="mt-2 space-y-1.5 text-muted-foreground">
                  <li>
                    1. 前往
                    <span className="font-medium text-foreground">设置 → API 连接与服务</span>
                  </li>
                  <li>2. 选择或新增一个自定义供应商</li>
                  <li>3. 填写火山方舟编码计划的模型名称（如 doubao-...）</li>
                  <li>4. API 地址与 Key 可填占位符，由本地代理转发</li>
                  <li>5. 返回 TRPG 页面即可开始游戏</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">
                提示：本地代理服务器运行于 localhost:18527，负责将请求转发至火山方舟 API（ark.cn-beijing.volces.com/api/coding/v3）。
              </p>
            </motion.div>
          </ScrollArea>
          <DialogFooter className="gap-2 sm:gap-2">
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
