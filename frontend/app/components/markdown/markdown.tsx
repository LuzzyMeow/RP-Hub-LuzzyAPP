import * as React from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { cn } from "~/lib/utils";
import { getCodePreviewLanguage } from "~/components/workbench/code-preview-language";
import { useOptionalWorkbench } from "~/components/workbench/workbench-context";
import { CodeBlock } from "./code-block";
import "katex/dist/katex.min.css";
import "./markdown.css";
import "streamdown/styles.css";

// v0.8.3: 自定义 remark 插件 — 保护未定义的 reference link/image 不被丢弃
// 问题根因：Streamdown 流式结束后切换到 static 模式，[text] 被解析为 shortcut reference link，
// 无引用定义时被丢弃，导致 [文字] 内容消失
// 修复方案：将未匹配引用定义的 linkReference/imageReference 节点还原为纯文本
// v0.8.3 增强：支持嵌套格式化（[*italic*]、[**bold**]）、fullReference（[text][ref]）、
// imageReference（![text]）、collapsed（[text][]）全场景
function extractNodeText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.value || "";
  if (node.type === "emphasis") return `*${(node.children || []).map(extractNodeText).join("")}*`;
  if (node.type === "strong") return `**${(node.children || []).map(extractNodeText).join("")}**`;
  if (node.type === "delete") return `~~${(node.children || []).map(extractNodeText).join("")}~~`;
  if (node.type === "inlineCode") return `\`${node.value || ""}\``;
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(extractNodeText).join("");
  }
  return node.value || "";
}

function protectUndefinedReferences(): (tree: any) => void {
  return (tree: any) => {
    // 第一遍：收集所有 reference 定义
    const definitions = new Set<string>();
    const collectDefs = (node: any): void => {
      if (node.type === "definition" && node.identifier) {
        definitions.add(node.identifier.toLowerCase());
      }
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          collectDefs(child);
        }
      }
    };
    collectDefs(tree);

    // 第二遍：将未匹配的 linkReference/imageReference 节点还原为纯文本
    const replaceUndefined = (node: any): void => {
      if (node.children && Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const isLinkRef = child.type === "linkReference";
          const isImageRef = child.type === "imageReference";

          if ((isLinkRef || isImageRef) && child.identifier) {
            const identifier = child.identifier.toLowerCase();
            if (!definitions.has(identifier)) {
              // v0.8.3: 递归提取子节点文本，支持嵌套格式化
              const text = (child.children || []).map((c: any) => extractNodeText(c)).join("");
              const prefix = isImageRef ? "!" : "";
              // 保留原始格式：[text]、![text]、[text][ref]、![text][ref]
              if (child.referenceType === "full") {
                node.children[i] = {
                  type: "text",
                  value: `${prefix}[${text}][${child.label || child.identifier}]`,
                };
              } else {
                node.children[i] = {
                  type: "text",
                  value: `${prefix}[${text}]`,
                };
              }
              continue;
            }
          }
          replaceUndefined(child);
        }
      }
    };
    replaceUndefined(tree);
  };
}

// v0.8.7-fix: 预编译正则常量，避免每次 preProcess 都 new RegExp()
const INLINE_LATEX_REGEX = /\\\((.+?)\\\)/g;
const BLOCK_LATEX_REGEX = /\\\[(.+?)\\\]/gs;
const CODE_BLOCK_REGEX = /```[\s\S]*?```|`[^`\n]*`/g;
// v0.4.6: 高亮支持多种括号:"" "" 「」 【】 〔〕 『』 {} ()
// v0.4.3 曾包含 [] 方括号,v0.4.6 移除 [] 高亮
// 统一正则匹配所有括号对,左括号和右括号分别捕获
const QUOTE_HIGHLIGHT_REGEX =
  /([\u201C\u300C\u3010\u3014\u300E{("])([^\u201D\u300D\u3011\u3015\u300F})"]+?)([\u201D\u300D\u3011\u3015\u300F})"])/g;

// Preprocess markdown content
function preProcess(content: string): string {
  // v0.8.7-fix: 短内容（< 50 字符）且无特殊标记时直接返回，避免正则开销
  if (
    content.length < 50 &&
    !content.includes("\\(") &&
    !content.includes("\\[") &&
    !content.includes("```") &&
    !content.includes('"') &&
    !content.includes("「")
  ) {
    return content;
  }

  // Find all code block positions
  const codeBlocks: { start: number; end: number }[] = [];
  let match;
  // v0.8.7-fix: 直接使用预编译常量，重置 lastIndex 避免全局正则状态残留
  CODE_BLOCK_REGEX.lastIndex = 0;
  while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
    codeBlocks.push({ start: match.index, end: match.index + match[0].length });
  }

  // Check if position is inside a code block
  const isInCodeBlock = (position: number): boolean => {
    return codeBlocks.some((range) => position >= range.start && position < range.end);
  };

  // Replace inline formulas \( ... \) to $ ... $, skip code blocks
  INLINE_LATEX_REGEX.lastIndex = 0;
  let result = content.replace(INLINE_LATEX_REGEX, (match, group1, offset) => {
    if (isInCodeBlock(offset)) {
      return match;
    }
    return `$${group1}$`;
  });

  // Replace block formulas \[ ... \] to $$ ... $$, skip code blocks
  BLOCK_LATEX_REGEX.lastIndex = 0;
  result = result.replace(BLOCK_LATEX_REGEX, (match, group1, offset) => {
    if (isInCodeBlock(offset)) {
      return match;
    }
    return `$$${group1}$$`;
  });

  // v0.4.3: 多括号高亮，将 "..." 「...」 {...} [...] (...) 等替换为 <span class="luzzy-highlight">...</span>
  // 颜色由 CSS 变量 --luzzy-highlight-color 控制，未设置时使用 inherit（无高亮效果）
  // 新正则有 3 个捕获组：左括号、内容、右括号
  QUOTE_HIGHLIGHT_REGEX.lastIndex = 0;
  result = result.replace(
    QUOTE_HIGHLIGHT_REGEX,
    (match, leftBracket, content, rightBracket, offset) => {
      if (isInCodeBlock(offset)) {
        return match;
      }
      return `${leftBracket}<span class="luzzy-highlight">${content}</span>${rightBracket}`;
    },
  );

  return result;
}

type MarkdownProps = {
  content: string;
  className?: string;
  onClickCitation?: (id: string) => void;
  allowCodePreview?: boolean;
  isAnimating?: boolean;
  /** v0.5.8: 直出模式（禁用词级动画），用于正文气泡；思考卡片保留动画 */
  directRender?: boolean;
};

function getNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }
  return "";
}

export default React.memo(function Markdown({
  content,
  className,
  onClickCitation,
  allowCodePreview = true,
  isAnimating = false,
  directRender = false,
}: MarkdownProps) {
  const { t } = useTranslation("markdown");
  const workbench = useOptionalWorkbench();
  // LUZZY 的 SettingsSlice 扁平结构无 displaySetting，使用默认值（showLineNumbers/codeBlockAutoWrap 均为 false）
  const displaySetting: { showLineNumbers?: boolean; codeBlockAutoWrap?: boolean } = {};
  // v0.8.7-fix: 恢复 useDeferredValue，避免流式输出每帧全量解析 markdown + Streamdown 重新渲染
  // useDeferredValue 让 React 在空闲时处理 markdown 解析，不阻塞主线程交互
  // 配合 chat-slice 的 rAF 节流，实现真正的实时流式渲染（而非伪打字机）
  const deferredContent = React.useDeferredValue(content);
  const processedContent = React.useMemo(() => preProcess(deferredContent), [deferredContent]);
  const handlePreviewCode = React.useCallback(
    (language: string, code: string) => {
      if (!allowCodePreview || !workbench) return;

      const previewLanguage = getCodePreviewLanguage(language);
      if (!previewLanguage) return;

      workbench.openPanel({
        type: "code-preview",
        title: t("markdown.code_preview_title", {
          language: previewLanguage.toUpperCase(),
        }),
        payload: {
          language: previewLanguage,
          code,
        },
      });
    },
    [allowCodePreview, t, workbench],
  );

  return (
    <div className={cn("markdown", className)}>
      <Streamdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, protectUndefinedReferences]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        plugins={{ cjk: cjk }}
        isAnimating={isAnimating}
        animated={
          directRender
            ? false
            : isAnimating
              ? { animation: "fadeIn", sep: "word", duration: 150 }
              : false
        }
        controls={{ code: false, mermaid: false }}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const match = /language-([A-Za-z0-9_-]+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            const isBlock = code.includes("\n");

            if (match || isBlock) {
              const language = match?.[1] || "";
              return (
                <CodeBlock
                  language={language}
                  code={code}
                  showLineNumbers={displaySetting?.showLineNumbers ?? false}
                  wrapLines={displaySetting?.codeBlockAutoWrap ?? false}
                  onPreview={
                    allowCodePreview && workbench
                      ? () => {
                          handlePreviewCode(language, code);
                        }
                      : undefined
                  }
                />
              );
            }

            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
          a: ({ href, children, ...props }) => {
            const childText = getNodeText(children).trim();

            // Citation format: [citation,domain](id)
            if (childText.startsWith("citation,")) {
              const domain = childText.substring("citation,".length);
              const id = (href || "").trim();

              if (id.length === 6) {
                return (
                  <span
                    className="citation-badge"
                    onClick={() => onClickCitation?.(id)}
                    title={domain}
                  >
                    {domain}
                  </span>
                );
              }

              if (href) {
                return (
                  <a
                    className="citation-badge"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={domain}
                    {...props}
                  >
                    {domain}
                  </a>
                );
              }
            }

            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </Streamdown>
    </div>
  );
});
