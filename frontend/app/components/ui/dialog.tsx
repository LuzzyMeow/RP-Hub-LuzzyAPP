import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { scaleIn, overlayAnimation } from "~/lib/motion-presets"
import { IconClose } from "~/components/luzzy/luzzy-icons"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      {...props}
      asChild
    >
      <motion.div
        variants={overlayAnimation}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn("fixed inset-0 z-50 bg-black/50", className)}
      />
    </DialogPrimitive.Overlay>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  // v0.3.1: 弹窗输入法适配 — 监听 VisualViewport 变化，自适应弹窗高度
  // v0.3.9: 仅限制最大高度，不再覆盖 transform，避免破坏居中定位；只作用于当前打开弹窗
  // v0.4.0: 移除无效的 style.maxHeight 设置（被 app.css 的 !important 覆盖），
  //         改为依赖 CSS 90dvh 单位自动适应输入法弹出；保留监听用于触发重排
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    let rafId: number;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // v0.4.0: 通过强制重排触发弹窗重新计算布局，依赖 CSS 90dvh 自动适应
        const dialogs = document.querySelectorAll("[data-slot='dialog-content'][data-state='open']");
        dialogs.forEach((dialog) => {
          if (dialog instanceof HTMLElement) {
            // 触发重排，让 CSS dvh 单位生效
            void dialog.offsetHeight;
          }
        });
      });
    };
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
    onResize();
    return () => {
      cancelAnimationFrame(rafId);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, []);

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        {...props}
        asChild
      >
        <motion.div
          variants={scaleIn}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn(
            "bg-background fixed top-[50%] left-[50%] z-50 box-border grid min-w-0 w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-xl border p-6 outline-none",
            className
          )}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <IconClose className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex min-w-0 shrink-0 flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex min-w-0 shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("min-w-0 break-words text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("min-w-0 break-words text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
