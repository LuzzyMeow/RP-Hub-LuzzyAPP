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
import { IconExclamation, IconTrash, IconCheck, IconClose } from "~/components/luzzy/luzzy-icons";

export interface ConfirmOptions {
  /** 标题(默认"确认操作") */
  title?: string;
  /** 描述内容 */
  description: string;
  /** 确认按钮文字(默认"确认") */
  confirmText?: string;
  /** 取消按钮文字(默认"取消") */
  cancelText?: string;
  /** 是否为破坏性操作(删除等,确认按钮变红色,默认 false) */
  destructive?: boolean;
  /** 是否显示警告图标(默认 true) */
  showIcon?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

const ConfirmContext = React.createContext<{
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
} | null>(null);

/**
 * ConfirmProvider - 在 root.tsx 中包裹应用
 * 提供 confirm() 方法,替代原生 window.confirm()
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState>({
    open: false,
    description: "",
  });

  const confirm = React.useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions = typeof options === "string" ? { description: options } : options;
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        resolve,
        title: opts.title ?? "确认操作",
        description: opts.description,
        confirmText: opts.confirmText ?? "确认",
        cancelText: opts.cancelText ?? "取消",
        destructive: opts.destructive ?? false,
        showIcon: opts.showIcon ?? true,
      });
    });
  }, []);

  const handleClose = React.useCallback((result: boolean) => {
    setState((prev) => {
      prev.resolve?.(result);
      return { ...prev, open: false, resolve: undefined };
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => !open && handleClose(false)}>
        <DialogContent showCloseButton={false} className="min-w-0 overflow-hidden max-w-sm">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            {state.showIcon && (
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                  state.destructive
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {state.destructive ? <IconTrash size={20} /> : <IconExclamation size={20} />}
              </motion.div>
            )}
            <DialogTitle className="text-base">{state.title}</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {state.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-3 px-2 pt-2">
            <Button
              variant="outline"
              className="w-full max-w-[10rem] gap-2 py-2.5"
              onClick={() => handleClose(false)}
            >
              <IconClose size={16} />
              {state.cancelText}
            </Button>
            <Button
              variant={state.destructive ? "destructive" : "default"}
              className="w-full max-w-[10rem] gap-2 py-2.5"
              onClick={() => handleClose(true)}
            >
              {state.destructive ? <IconTrash size={16} /> : <IconCheck size={16} />}
              {state.confirmText}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * useConfirm hook
 * 返回 confirm 函数,调用后弹出确认弹窗,返回 Promise<boolean>
 * @example
 * const confirm = useConfirm();
 * const ok = await confirm({ description: "确定删除?", destructive: true });
 * if (ok) { /* 执行删除 *\/ }
 */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm 必须在 ConfirmProvider 内使用");
  }
  return ctx.confirm;
}
