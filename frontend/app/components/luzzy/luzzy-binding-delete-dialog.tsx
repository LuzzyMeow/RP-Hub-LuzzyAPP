import * as React from "react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { IconLink, IconExclamation, IconTrash, IconClose } from "~/components/luzzy/luzzy-icons";

/**
 * 绑定删除确认弹窗选项
 */
export interface BindingDeleteOptions {
  /** 标题（默认"确认删除"） */
  title?: string;
  /** 描述内容 */
  description: string;
  /** 绑定的资源名称 */
  bindingName: string;
  /** 绑定资源类型（"世界书" 或 "角色卡"） */
  bindingType: "世界书" | "角色卡";
}

/** 用户选择的操作 */
export type BindingDeleteAction = "cancel" | "deleteOnly" | "syncDelete";

interface BindingDeleteState extends BindingDeleteOptions {
  open: boolean;
  resolve?: (value: BindingDeleteAction) => void;
}

const BindingDeleteContext = React.createContext<{
  confirmBindingDelete: (options: BindingDeleteOptions) => Promise<BindingDeleteAction>;
} | null>(null);

/**
 * BindingDeleteConfirmProvider - 在 root.tsx 中包裹应用
 * 提供 confirmBindingDelete() 方法，用于角色卡/世界书绑定删除确认
 */
export function BindingDeleteConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<BindingDeleteState>({
    open: false,
    description: "",
    bindingName: "",
    bindingType: "世界书",
  });

  const confirmBindingDelete = React.useCallback((options: BindingDeleteOptions) => {
    return new Promise<BindingDeleteAction>((resolve) => {
      setState({
        open: true,
        resolve,
        title: options.title ?? "确认删除",
        description: options.description,
        bindingName: options.bindingName,
        bindingType: options.bindingType,
      });
    });
  }, []);

  const handleClose = React.useCallback((result: BindingDeleteAction) => {
    setState((prev) => {
      prev.resolve?.(result);
      return { ...prev, open: false, resolve: undefined };
    });
  }, []);

  return (
    <BindingDeleteContext.Provider value={{ confirmBindingDelete }}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => !open && handleClose("cancel")}>
        <DialogContent showCloseButton={false} className="min-w-0 overflow-hidden max-w-sm">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <IconTrash size={20} />
            </motion.div>
            <DialogTitle className="text-base">{state.title}</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {state.description}
            </DialogDescription>
          </DialogHeader>

          {/* 绑定提示 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
          >
            <IconLink size={16} className="shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                绑定{state.bindingType}：{state.bindingName}
              </span>
              <span className="text-xs text-muted-foreground">
                <IconExclamation size={10} className="mr-1 inline-block align-text-bottom" />
                仅删除当前将保留绑定{state.bindingType}；同步删除将一并移除
              </span>
            </div>
          </motion.div>

          {/* 三按钮 */}
          <div className="flex justify-center gap-2 px-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5 py-2.5"
              onClick={() => handleClose("cancel")}
            >
              <IconClose size={16} />
              取消
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-1.5 py-2.5"
              onClick={() => handleClose("deleteOnly")}
            >
              <IconTrash size={16} />
              仅删除
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-1.5 py-2.5"
              onClick={() => handleClose("syncDelete")}
            >
              <IconTrash size={16} />
              同步删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </BindingDeleteContext.Provider>
  );
}

/**
 * useBindingDeleteConfirm hook
 * 返回 confirmBindingDelete 函数，调用后弹出绑定删除确认弹窗，返回用户选择的操作
 * @example
 * const confirmBindingDelete = useBindingDeleteConfirm();
 * const action = await confirmBindingDelete({
 *   title: "删除角色卡",
 *   description: "确定删除角色卡「xxx」吗？",
 *   bindingName: "某世界书",
 *   bindingType: "世界书",
 * });
 * if (action === "syncDelete") { /* 同步删除 *\/ }
 */
export function useBindingDeleteConfirm() {
  const ctx = React.useContext(BindingDeleteContext);
  if (!ctx) {
    throw new Error("useBindingDeleteConfirm 必须在 BindingDeleteConfirmProvider 内使用");
  }
  return ctx.confirmBindingDelete;
}
