/**
 * 工具页面（v0.2.0 重构）
 *
 * 三大分类 Tab：
 * 1. SKILL：GitHub 导入 / 文件导入 / 手动添加 / 管理
 * 2. MCP：HTTP MCP 配置 / JSON 导入 / 角色卡启用
 * 3. 内置工具：全局模式 + 向量记忆 / 关键词检索 / 记忆召回 / Anysearch
 */

import * as React from "react";
import type { Route } from "./+types/tools";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconToolKit,
  IconPuzzle,
  IconBook,
  IconSearch,
  IconGlobe,
  IconImport,
  IconFile,
  IconCheck,
  IconClose,
  IconTag,
  IconLink,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import type {
  ActiveTool,
  Skill,
  BuiltinToolType,
  ToolGlobalMode,
  McpSubTool,
} from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
import { logger } from "~/services/logger";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Card } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Slider } from "~/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import {
  springEnter,
  pressable,
  pressableSubtle,
  fadeSlide,
} from "~/lib/motion-presets";
import {
  parseSkillMd as parseSkillMdService,
  importSkillFromGithubFull,
  importSkillFromZip,
} from "~/services/skillService";
import {
  initializeMcpServer,
  listMcpTools,
  parseMcpImportJsonMulti,
} from "~/services/mcpService";
import { toast } from "sonner";

export function meta(_: Route.MetaArgs) {
  return [{ title: "工具 - LUZZY" }];
}

// ============================================================================
// 常量定义
// ============================================================================

type TabKey = "skill" | "mcp" | "builtin";

const TABS: { key: TabKey; label: string; icon: typeof IconBook }[] = [
  { key: "skill", label: "SKILL", icon: IconBook },
  { key: "mcp", label: "MCP", icon: IconPuzzle },
  { key: "builtin", label: "内置工具", icon: IconToolKit },
];

const BUILTIN_TOOL_LABELS: Record<BuiltinToolType, string> = {
  "vector-memory": "向量记忆主动检索",
  "keyword-search": "关键词检索",
  "memory-recall": "记忆召回",
  anysearch: "Anysearch 联网搜索",
};

const BUILTIN_TOOL_DESCRIPTIONS: Record<BuiltinToolType, string> = {
  "vector-memory":
    "使用嵌入模型在向量记忆分片中语义检索匹配内容，需配置嵌入模型。",
  "keyword-search": "在聊天消息中按关键词搜索匹配的对话内容。",
  "memory-recall": "召回历史记忆，按相关度排序返回。",
  anysearch: "联网搜索外部信息，获取实时数据。",
};

const BUILTIN_TOOL_RANGES: Record<BuiltinToolType, { min: number; max: number }> = {
  "vector-memory": { min: 3, max: 12 },
  "keyword-search": { min: 3, max: 21 },
  "memory-recall": { min: 3, max: 12 },
  anysearch: { min: 3, max: 12 },
};

const GLOBAL_MODE_LABELS: Record<ToolGlobalMode, string> = {
  force: "强制模式",
  active: "积极模式",
  adaptive: "自适应模式",
};

const GLOBAL_MODE_DESCRIPTIONS: Record<ToolGlobalMode, string> = {
  force: "每次对话都强制调用已启用的工具",
  active: "主动判断是否需要调用工具",
  adaptive: "根据上下文自适应决定是否调用工具",
};

// ============================================================================
// 辅助函数
// ============================================================================

/** 创建空白 MCP 工具 */
function createEmptyMcpTool(): ActiveTool {
  return {
    id: crypto.randomUUID(),
    name: "",
    enabled: false,
    callName: "",
    type: "mcp_http",
    description: "",
    displayDescription: "",
    resultCount: 3,
    resultCountVersion: 4,
    tavilyApiKey: "",
    worldInfoAccessMode: "all",
    worldInfoAccessModeVersion: 2,
    enableMode: "all",
    allowedCharacterUuids: [],
    mcpServerUrl: "",
    mcpServerName: "",
    mcpTools: [],
    skillFileContent: "",
    skillFileName: "",
  };
}

/** 创建空白 SKILL */
function createEmptySkill(): Skill {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    source: "manual",
    files: [],
    tags: [],
    enabledForCharacters: [],
    enabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 从 SKILL.md 内容解析名称和描述（委托给 skillService，支持 YAML frontmatter） */
function parseSkillMd(content: string): { name: string; description: string } {
  const parsed = parseSkillMdService(content);
  return { name: parsed.name, description: parsed.description };
}

// ============================================================================
// 主组件
// ============================================================================

export default function ToolsPage() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("skill");

  return (
    <LuzzyLayout title="工具">
      <div className="flex h-full flex-col">
        {/* Tab 导航 */}
        <div className="flex items-center gap-1 border-b border-border/50 px-4 pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <motion.button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                {...pressableSubtle}
              >
                <Icon className="size-4" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="tools-tab-indicator"
                    className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              {...fadeSlide}
              className="h-full"
            >
              {activeTab === "skill" && <SkillTab />}
              {activeTab === "mcp" && <McpTab />}
              {activeTab === "builtin" && <BuiltinToolsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </LuzzyLayout>
  );
}

// ============================================================================
// SKILL Tab
// ============================================================================

function SkillTab() {
  const skills = useAppStore((s) => s.skills);
  const addSkill = useAppStore((s) => s.addSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);
  const removeSkill = useAppStore((s) => s.removeSkill);
  const toggleSkillEnabled = useAppStore((s) => s.toggleSkillEnabled);
  const loadSkills = useAppStore((s) => s.loadSkills);
  const saveSkills = useAppStore((s) => s.saveSkills);
  const characters = useAppStore((s) => s.characters);
  const confirm = useConfirm();

  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState<Skill | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [importMode, setImportMode] = React.useState<"manual" | "github" | "file">(
    "manual",
  );
  const [githubUrl, setGithubUrl] = React.useState("");
  const [skillContent, setSkillContent] = React.useState("");
  const [skillTags, setSkillTags] = React.useState<string[]>([]);

  React.useEffect(() => {
    void (async () => {
      await loadSkills();
      setLoaded(true);
    })();
  }, [loadSkills]);

  /** 持久化辅助 */
  const persist = React.useCallback(async () => {
    await saveSkills();
  }, [saveSkills]);

  /** 新建 SKILL */
  const handleNew = React.useCallback(() => {
    setEditing(createEmptySkill());
    setIsNew(true);
    setImportMode("manual");
    setGithubUrl("");
    setSkillContent("");
    setSkillTags([]);
  }, []);

  /** 保存 SKILL */
  const [saving, setSaving] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    if (!editing) return;
    // GitHub/ZIP 导入模式名称自动从 SKILL.md 解析，跳过手动校验
    const skipNameCheck = isNew && (importMode === "github" || importMode === "file");
    if (!skipNameCheck && !editing.name.trim()) {
      toast.warning("请输入技能名称");
      return;
    }

    setSaving(true);
    try {
      let finalSkill = { ...editing };

      // 根据导入模式处理
      if (isNew) {
        if (importMode === "manual" || importMode === "file") {
          if (!skillContent.trim()) {
            toast.warning("请输入或导入 SKILL.md 内容");
            return;
          }
          const parsed = parseSkillMd(skillContent);
          finalSkill.name = editing.name || parsed.name;
          finalSkill.description = editing.description || parsed.description;
          finalSkill.files = [
            {
              name: "SKILL.md",
              path: "SKILL.md",
              isDirectory: false,
              content: skillContent,
            },
          ];
          finalSkill.source = importMode === "file" ? "zip" : "manual";
        } else if (importMode === "github") {
          if (!githubUrl.trim()) {
            toast.warning("请输入 GitHub 仓库 URL");
            return;
          }
          // 调用完整 GitHub 导入（含所有附属文件）
          try {
            const { files, parsed, rawUrl } = await importSkillFromGithubFull(githubUrl);
            finalSkill.githubUrl = githubUrl;
            finalSkill.source = "github";
            finalSkill.files = files;
            finalSkill.name = editing.name || parsed.name;
            finalSkill.description = editing.description || parsed.description;
            // 保存 rawUrl 到 description 末尾以便后续更新（避免新增字段）
            void rawUrl;
          } catch (e) {
            // v0.3.2: 不再降级保存空文件，直接报错返回
            toast.error(`GitHub 导入失败：${e instanceof Error ? e.message : String(e)}`);
            setSaving(false);
            return;
          }
        }
        finalSkill.tags = skillTags;
        finalSkill.updatedAt = Date.now();
        addSkill(finalSkill);
      } else {
        updateSkill(editing.id, {
          name: editing.name,
          description: editing.description,
          tags: skillTags,
          enabledForCharacters: editing.enabledForCharacters,
        });
      }

      await persist();
      setEditing(null);
      // GitHub/ZIP 导入成功后显示自动识别到的 name 和 description
      if (isNew && (importMode === "github" || importMode === "file")) {
        const descPreview = finalSkill.description
          ? ` — ${finalSkill.description.slice(0, 60)}`
          : "";
        toast.success(`技能已创建：${finalSkill.name}${descPreview}`);
      } else {
        toast.success(isNew ? "技能已创建" : "技能已更新");
      }
    } finally {
      setSaving(false);
    }
  }, [editing, isNew, importMode, skillContent, githubUrl, skillTags, addSkill, updateSkill, persist]);

  /** 删除 SKILL */
  const handleDelete = React.useCallback(
    async (skill: Skill) => {
      const ok = await confirm({
        title: "删除技能",
        description: `确定删除技能「${skill.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      removeSkill(skill.id);
      await persist();
      toast.success("已删除");
    },
    [removeSkill, persist, confirm],
  );

  /** 切换启用 */
  const handleToggle = React.useCallback(
    async (skill: Skill) => {
      toggleSkillEnabled(skill.id);
      await persist();
    },
    [toggleSkillEnabled, persist],
  );

  /** 文件导入（支持 .md 文本和 .zip 压缩包） */
  const handleFileImport = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // ZIP 文件：调用 skillService.importSkillFromZip
      if (file.name.toLowerCase().endsWith(".zip")) {
        try {
          const { files, parsed } = await importSkillFromZip(file);
          // 找到 SKILL.md 内容用于编辑器展示
          const skillMdFile = files.find(
            (f) => f.name === "SKILL.md" || (f.path?.endsWith("/SKILL.md") ?? false),
          );
          const skillMdContent =
            (skillMdFile?.content) ?? "";
          setSkillContent(skillMdContent);
          if (editing) {
            setEditing({
              ...editing,
              name: editing.name || parsed.name,
              description: editing.description || parsed.description,
            });
          }
          toast.success(`ZIP 已导入（${files.length} 个文件）`);
        } catch (err) {
          toast.error(`ZIP 解析失败：${err instanceof Error ? err.message : String(err)}`);
        }
        e.target.value = "";
        return;
      }

      // 普通 .md 文本文件
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || "");
        setSkillContent(content);
        const parsed = parseSkillMd(content);
        if (editing) {
          setEditing({
            ...editing,
            name: editing.name || parsed.name,
            description: editing.description || parsed.description,
          });
        }
        toast.success("文件已导入");
      };
      reader.onerror = () => toast.error("文件读取失败");
      reader.readAsText(file);
      e.target.value = "";
    },
    [editing],
  );

  /** 标签输入 */
  const [tagInput, setTagInput] = React.useState("");
  const handleAddTag = React.useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !skillTags.includes(tag)) {
      setSkillTags([...skillTags, tag]);
    }
    setTagInput("");
  }, [tagInput, skillTags]);

  const updateField = React.useCallback(
    <K extends keyof Skill>(key: K, value: Skill[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      {skills.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBook className="size-6" />
              </EmptyMedia>
              <EmptyTitle>还没有技能</EmptyTitle>
              <EmptyDescription>导入或创建 SKILL 以增强角色卡能力</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={handleNew} {...pressable}>
                <IconPlus className="mr-2 size-4" />
                新建技能
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={handleNew} {...pressable}>
              <IconPlus className="mr-1.5 size-4" />
              新建
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {skills.map((s, i) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                >
                  <Card className="gap-3 p-4 transition-all hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium">{s.name}</h3>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {s.source === "github" ? "GitHub" : s.source === "zip" ? "文件" : "手动"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {s.description || "暂无描述"}
                        </p>
                        {s.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={() => void handleToggle(s)}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        onClick={() => {
                          setEditing({ ...s });
                          setSkillTags(s.tags);
                          setIsNew(false);
                        }}
                      >
                        <IconEdit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-destructive"
                        onClick={() => void handleDelete(s)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {/* 编辑/新建弹窗 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建技能" : "编辑技能"}</DialogTitle>
            <DialogDescription>
              {isNew ? "导入或手动创建 SKILL.md" : "修改技能信息与角色卡绑定"}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              {isNew && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">导入方式</label>
                  <Select
                    value={importMode}
                    onValueChange={(v) => setImportMode(v as typeof importMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动编写</SelectItem>
                      <SelectItem value="github">GitHub 仓库 URL</SelectItem>
                      <SelectItem value="file">从文件导入</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isNew && importMode === "github" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid gap-2"
                >
                  <label className="text-sm font-medium">GitHub 仓库 URL</label>
                  <Input
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/user/skill-repo"
                  />
                  <p className="text-xs text-muted-foreground">
                    输入仓库 URL，系统将自动拉取 SKILL.md 并解析名称与描述。
                  </p>
                </motion.div>
              )}

              {isNew && importMode === "file" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid gap-2"
                >
                  <label className="text-sm font-medium">导入 SKILL.md / ZIP 文件</label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById("skill-file-input")?.click()
                      }
                    >
                      <IconFile className="mr-1.5 size-4" />
                      选择文件
                    </Button>
                    <input
                      id="skill-file-input"
                      type="file"
                      accept=".md,.txt,.markdown,.zip"
                      className="hidden"
                      onChange={handleFileImport}
                    />
                  </div>
                  {skillContent && (
                    <p className="text-xs text-green-600">已导入 {skillContent.length} 字符</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    支持 .md / .zip 文件，系统将自动解析 SKILL.md 中的名称与描述。
                  </p>
                </motion.div>
              )}

              {isNew && importMode === "manual" && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">SKILL.md 内容</label>
                  <Textarea
                    value={skillContent}
                    onChange={(e) => setSkillContent(e.target.value)}
                    placeholder="# 技能名称&#10;> 技能描述&#10;&#10;技能内容..."
                    rows={8}
                    className="font-mono text-xs"
                  />
                </div>
              )}

              {/* 手动模式或编辑已有技能时显示手动字段；GitHub/ZIP 导入自动解析，无需手动填写 */}
              {(!isNew || importMode === "manual") && (
                <>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">技能名称</label>
                    <Input
                      value={editing.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="技能名称"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">描述</label>
                    <Textarea
                      value={editing.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      placeholder="技能描述"
                      rows={2}
                    />
                  </div>

                  {/* 标签 */}
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">标签</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder="输入标签后回车"
                      />
                      <Button size="sm" variant="outline" onClick={handleAddTag}>
                        <IconTag className="size-4" />
                      </Button>
                    </div>
                    {skillTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {skillTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="cursor-pointer gap-1"
                            onClick={() =>
                              setSkillTags(skillTags.filter((t) => t !== tag))
                            }
                          >
                            {tag}
                            <IconClose className="size-3" />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 角色卡绑定 */}
                  {characters.length > 0 && (
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">启用的角色卡</label>
                      <div className="max-h-32 overflow-y-auto rounded-md border p-2">
                        {characters.map((c) => {
                          const checked =
                            editing.enabledForCharacters?.includes(c.uuid) ?? false;
                          return (
                            <label
                              key={c.uuid}
                              className="flex items-center gap-2 py-1 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const set = new Set(
                                    editing.enabledForCharacters ?? [],
                                  );
                                  if (e.target.checked) set.add(c.uuid);
                                  else set.delete(c.uuid);
                                  updateField(
                                    "enabledForCharacters",
                                    Array.from(set),
                                  );
                                }}
                              />
                              <span className="truncate">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        不选择则全局启用
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// MCP Tab
// ============================================================================

function McpTab() {
  const [tools, setTools] = React.useState<ActiveTool[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState<ActiveTool | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [jsonInput, setJsonInput] = React.useState("");
  const [showJsonImport, setShowJsonImport] = React.useState(false);
  // v0.3.0 新增：MCP 测试连接状态
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    message: string;
    tools?: McpSubTool[];
  } | null>(null);

  const characters = useAppStore((s) => s.characters);
  const confirm = useConfirm();

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await getItem<ActiveTool[]>("activeTools", "activeTools");
        // 仅显示 MCP 类型
        setTools((data ?? []).filter((t) => t.type === "mcp_http"));
      } catch (e) {
        toast.error("加载 MCP 工具失败：" + (e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /** 持久化（需读取全部工具再合并 MCP 部分） */
  const persist = React.useCallback(async (mcpTools: ActiveTool[]) => {
    setTools(mcpTools);
    try {
      const all = await getItem<ActiveTool[]>("activeTools", "activeTools");
      const nonMcp = (all ?? []).filter((t) => t.type !== "mcp_http");
      await setItem("activeTools", "activeTools", [...nonMcp, ...mcpTools]);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  const handleEdit = React.useCallback((t: ActiveTool) => {
    setEditing({ ...t });
    setIsNew(false);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.warning("请输入工具名称");
      return;
    }
    if (!editing.mcpServerUrl?.trim()) {
      toast.warning("请输入 MCP 服务器 URL");
      return;
    }
    const exists = tools.some((t) => t.id === editing.id);
    const next = exists
      ? tools.map((t) => (t.id === editing.id ? editing : t))
      : [...tools, editing];
    await persist(next);
    setEditing(null);
    toast.success(isNew ? "MCP 工具已创建" : "MCP 工具已更新");
  }, [editing, tools, isNew, persist]);

  const handleDelete = React.useCallback(
    async (t: ActiveTool) => {
      const ok = await confirm({
        title: "删除 MCP 工具",
        description: `确定删除 MCP 工具「${t.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      await persist(tools.filter((x) => x.id !== t.id));
      toast.success("已删除");
    },
    [tools, persist, confirm],
  );

  const handleToggle = React.useCallback(
    async (t: ActiveTool) => {
      await persist(
        tools.map((x) =>
          x.id === t.id ? { ...x, enabled: !x.enabled } : x,
        ),
      );
    },
    [tools, persist],
  );

  /** v0.3.0 新增：测试 MCP 连接 */
  const handleTestConnection = React.useCallback(async () => {
    if (!editing?.mcpServerUrl?.trim()) {
      toast.warning("请先输入 MCP 服务器 URL");
      return;
    }
    setTesting(true);
    setTestResult(null);
    logger.info("user", `测试 MCP 连接: ${editing.mcpServerUrl}`);
    try {
      // 1. 初始化连接
      const serverInfo = await initializeMcpServer(editing.mcpServerUrl);
      // 2. 获取工具列表
      const mcpTools = await listMcpTools(
        editing.mcpServerUrl,
        serverInfo.sessionId,
      );
      setTestResult({
        success: true,
        message: `连接成功，发现 ${mcpTools.length} 个工具`,
        tools: mcpTools,
      });
      // v0.3.2: 持久化连接状态和工具列表到 editing 对象
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              mcpTools,
              mcpConnectionStatus: "connected",
              mcpLastTestedAt: Date.now(),
            }
          : prev,
      );
      toast.success(`MCP 连接成功，发现 ${mcpTools.length} 个工具`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({
        success: false,
        message: msg,
      });
      // v0.3.2: 持久化失败状态到 editing 对象
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              mcpConnectionStatus: "failed",
              mcpConnectionError: msg,
              mcpLastTestedAt: Date.now(),
            }
          : prev,
      );
      toast.error(`MCP 连接失败：${msg}`);
    } finally {
      setTesting(false);
    }
  }, [editing]);

  /** JSON 导入（支持 mcpServers 嵌套 / 扁平 / 简写格式，多服务器批量导入） */
  const handleJsonImport = React.useCallback(async () => {
    let result;
    try {
      result = parseMcpImportJsonMulti(jsonInput);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "JSON 格式错误");
      return;
    }

    const { configs, stdioSkipped } = result;

    // 全部为 stdio 格式
    if (configs.length === 0) {
      if (stdioSkipped.length > 0) {
        toast.warning("暂不支持 stdio 格式的 MCP 服务器");
      } else {
        toast.warning("未识别到可导入的 MCP 配置");
      }
      return;
    }

    // 为每个配置创建对应工具
    const baseTs = Date.now();
    const newTools: ActiveTool[] = configs.map((cfg, idx) => ({
      ...createEmptyMcpTool(),
      id: crypto.randomUUID(),
      name: cfg.name || `导入的 MCP ${idx + 1}`,
      callName: `mcp_${baseTs}_${idx}`,
      mcpServerUrl: cfg.url,
      mcpServerName: cfg.name || "",
      description: "",
      displayDescription: "",
      enabled: false,
      enableMode: "all",
      allowedCharacterUuids: [],
      mcpTools: [],
    }));

    await persist([...tools, ...newTools]);
    setShowJsonImport(false);
    setJsonInput("");

    // 部分为 stdio 格式时提示
    if (stdioSkipped.length > 0) {
      toast.warning(
        `暂不支持 stdio 格式的 MCP 服务器（已跳过：${stdioSkipped.join(", ")}）`,
      );
    }

    const names = newTools.map((t) => t.name).join(", ");
    logger.info("user", `导入工具: ${newTools.length} 个（${names}）`);
    toast.success(`已导入 ${newTools.length} 个 MCP 工具：${names}`);

    // v0.3.2: 导入后自动测试每个新工具的连接
    let currentTools = [...tools, ...newTools];
    for (const newTool of newTools) {
      if (!newTool.mcpServerUrl?.trim()) continue;
      try {
        const serverInfo = await initializeMcpServer(newTool.mcpServerUrl);
        const mcpTools = await listMcpTools(
          newTool.mcpServerUrl,
          serverInfo.sessionId,
        );
        currentTools = currentTools.map((t) =>
          t.id === newTool.id
            ? {
                ...t,
                mcpTools,
                mcpConnectionStatus: "connected" as const,
                mcpLastTestedAt: Date.now(),
              }
            : t,
        );
        await persist(currentTools);
        toast.success(`${newTool.name}: 连接成功，发现 ${mcpTools.length} 个工具`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        currentTools = currentTools.map((t) =>
          t.id === newTool.id
            ? {
                ...t,
                mcpConnectionStatus: "failed" as const,
                mcpConnectionError: msg,
                mcpLastTestedAt: Date.now(),
              }
            : t,
        );
        await persist(currentTools);
        toast.error(`${newTool.name}: 连接失败`);
      }
    }
  }, [jsonInput, tools, persist]);

  const updateField = React.useCallback(
    <K extends keyof ActiveTool>(key: K, value: ActiveTool[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      {tools.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconPuzzle className="size-6" />
              </EmptyMedia>
              <EmptyTitle>还没有 MCP 工具</EmptyTitle>
              <EmptyDescription>添加 HTTP MCP 服务器或导入 JSON 配置</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowJsonImport(true)}
                  {...pressable}
                >
                  <IconImport className="mr-2 size-4" />
                  JSON 导入
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="mb-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowJsonImport(true)}
            >
              <IconImport className="mr-1.5 size-4" />
              JSON 导入
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {tools.map((t, i) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                >
                  <Card className="gap-3 p-4 transition-all hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium">{t.name}</h3>
                          {/* v0.3.2: MCP 连接状态徽章 */}
                          {t.mcpConnectionStatus === "connected" && (
                            <Badge variant="default" className="shrink-0 bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                              已连接
                            </Badge>
                          )}
                          {t.mcpConnectionStatus === "failed" && (
                            <Badge variant="destructive" className="shrink-0 text-xs">
                              连接失败
                            </Badge>
                          )}
                          {(!t.mcpConnectionStatus || t.mcpConnectionStatus === "untested") && (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              未测试
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {t.displayDescription || t.description || "暂无描述"}
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {t.mcpServerUrl || "未配置 URL"}
                        </p>
                      </div>
                      <Switch
                        checked={t.enabled}
                        onCheckedChange={() => void handleToggle(t)}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        onClick={() => handleEdit(t)}
                      >
                        <IconEdit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-destructive"
                        onClick={() => void handleDelete(t)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {/* 编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建 MCP 工具" : "编辑 MCP 工具"}</DialogTitle>
            <DialogDescription>配置 HTTP MCP 服务器</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={editing.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="工具名称"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">MCP 服务器 URL</label>
                <div className="flex gap-2">
                  <Input
                    value={editing.mcpServerUrl ?? ""}
                    onChange={(e) => updateField("mcpServerUrl", e.target.value)}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  {/* v0.3.0 新增：测试连接按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTestConnection()}
                    disabled={testing}
                    className="shrink-0"
                  >
                    {testing ? "测试中..." : "测试连接"}
                  </Button>
                </div>
                {/* v0.3.0 新增：测试结果显示 */}
                {testResult && (
                  <div
                    className={
                      "rounded-md border p-2 text-xs " +
                      (testResult.success
                        ? "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
                        : "border-destructive/30 bg-destructive/5 text-destructive")
                    }
                  >
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.tools && testResult.tools.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-muted-foreground">工具清单：</p>
                        {testResult.tools.map((tool, i) => (
                          <div
                            key={i}
                            className="rounded border border-border/50 bg-background/50 p-1.5"
                          >
                            <p className="font-mono text-xs font-medium">
                              {tool.name}
                            </p>
                            {tool.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {tool.description}
                              </p>
                            )}
                            {tool.inputSchema && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs text-muted-foreground">
                                  参数 schema
                                </summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-1 text-xs">
                                  {JSON.stringify(tool.inputSchema, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">服务器名称</label>
                <Input
                  value={editing.mcpServerName ?? ""}
                  onChange={(e) => updateField("mcpServerName", e.target.value)}
                  placeholder="服务器标识"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">描述</label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="工具描述（给 AI 看）"
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">启用模式</label>
                <Select
                  value={editing.enableMode ?? "all"}
                  onValueChange={(v) =>
                    updateField("enableMode", v as "all" | "whitelist")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部角色卡</SelectItem>
                    <SelectItem value="whitelist">白名单角色卡</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.enableMode === "whitelist" && characters.length > 0 && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">允许的角色卡</label>
                  <div className="max-h-32 overflow-y-auto rounded-md border p-2">
                    {characters.map((c) => {
                      const checked =
                        editing.allowedCharacterUuids?.includes(c.uuid) ?? false;
                      return (
                        <label
                          key={c.uuid}
                          className="flex items-center gap-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const set = new Set(
                                editing.allowedCharacterUuids ?? [],
                              );
                              if (e.target.checked) set.add(c.uuid);
                              else set.delete(c.uuid);
                              updateField(
                                "allowedCharacterUuids",
                                Array.from(set),
                              );
                            }}
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON 导入弹窗 */}
      <Dialog open={showJsonImport} onOpenChange={setShowJsonImport}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>JSON 导入 MCP 工具</DialogTitle>
            <DialogDescription>
              支持以下格式：Claude Desktop/Cursor（mcpServers 嵌套）、扁平格式（name+url）、简写格式（mcpServerUrl）。stdio 格式暂不支持。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={'{\n  "mcpServers": {\n    "github": { "url": "https://..." }\n  }\n}'}
            rows={8}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJsonImport(false)}>
              取消
            </Button>
            <Button onClick={() => void handleJsonImport()}>导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 内置工具 Tab
// ============================================================================

function BuiltinToolsTab() {
  const builtinToolConfigs = useAppStore((s) => s.builtinToolConfigs);
  const updateBuiltinToolConfig = useAppStore(
    (s) => s.updateBuiltinToolConfig,
  );
  const toolGlobalSettings = useAppStore((s) => s.toolGlobalSettings);
  const setToolGlobalMode = useAppStore((s) => s.setToolGlobalMode);
  const characters = useAppStore((s) => s.characters);
  const [editingType, setEditingType] = React.useState<BuiltinToolType | null>(
    null,
  );

  const editingConfig = editingType
    ? builtinToolConfigs.find((c) => c.type === editingType)
    : null;

  return (
    <div className="h-full p-4">
      <ScrollArea className="h-full">
        <div className="space-y-4 pb-4">
          {/* 全局模式设置 */}
          <motion.div {...springEnter}>
            <Card className="gap-3 p-4">
              <div className="flex items-center gap-2">
                <IconToolKit className="size-5 text-primary" />
                <h3 className="font-medium">工具全局模式</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                控制工具调用的整体策略
              </p>
              <div className="flex flex-col gap-2">
                {(Object.keys(GLOBAL_MODE_LABELS) as ToolGlobalMode[]).map(
                  (mode) => {
                    const isActive = toolGlobalSettings.mode === mode;
                    return (
                      <motion.button
                        key={mode}
                        onClick={() => setToolGlobalMode(mode)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                        {...pressableSubtle}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/20">
                          {isActive ? (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 25 }}
                            >
                              <IconCheck className="size-4 text-primary" />
                            </motion.span>
                          ) : (
                            <span className="size-2 rounded-full bg-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {GLOBAL_MODE_LABELS[mode]}
                          </span>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {GLOBAL_MODE_DESCRIPTIONS[mode]}
                          </p>
                        </div>
                      </motion.button>
                    );
                  },
                )}
              </div>
            </Card>
          </motion.div>

          {/* 内置工具列表 */}
          {builtinToolConfigs.map((config, i) => {
            const toolType = config.type;
            const range = BUILTIN_TOOL_RANGES[toolType];
            return (
              <motion.div
                key={toolType}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
              >
                <Card className="gap-3 p-4 transition-all hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {toolType === "vector-memory" && (
                          <IconSearch className="size-4 text-primary" />
                        )}
                        {toolType === "keyword-search" && (
                          <IconSearch className="size-4 text-primary" />
                        )}
                        {toolType === "memory-recall" && (
                          <IconBook className="size-4 text-primary" />
                        )}
                        {toolType === "anysearch" && (
                          <IconGlobe className="size-4 text-primary" />
                        )}
                        <h3 className="font-medium">
                          {BUILTIN_TOOL_LABELS[toolType]}
                        </h3>
                        {/* v0.3.0 新增：anysearch 官方文档链接 */}
                        {toolType === "anysearch" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            asChild
                          >
                            <a
                              href="https://www.anysearch.com/docs"
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="anysearch 官方文档"
                              title="官方文档"
                            >
                              <IconLink className="size-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {BUILTIN_TOOL_DESCRIPTIONS[toolType]}
                      </p>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(v) =>
                        updateBuiltinToolConfig(toolType, { enabled: v })
                      }
                    />
                  </div>

                  {config.enabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 border-t border-border/50 pt-3"
                    >
                      {/* 返回条数 */}
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">返回条数</label>
                          <span className="text-sm font-mono text-primary">
                            {config.resultCount}
                          </span>
                        </div>
                        <Slider
                          value={[config.resultCount]}
                          min={range.min}
                          max={range.max}
                          step={1}
                          onValueChange={(v) =>
                            updateBuiltinToolConfig(toolType, {
                              resultCount: v[0],
                            })
                          }
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{range.min}</span>
                          <span>{range.max}</span>
                        </div>
                      </div>

                      {/* anysearch 专属：API Token 输入 */}
                      {toolType === "anysearch" && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="grid gap-2"
                        >
                          <label className="text-sm font-medium">
                            API Token（可选）
                          </label>
                          <Input
                            type="password"
                            value={config.anysearchToken ?? ""}
                            onChange={(e) =>
                              updateBuiltinToolConfig(toolType, {
                                anysearchToken: e.target.value,
                              })
                            }
                            placeholder="留空使用匿名免费配额"
                          />
                          <p className="text-xs text-muted-foreground">
                            不填使用匿名免费配额，填写后使用付费配额
                          </p>
                        </motion.div>
                      )}

                      {/* 检索全局记忆 */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          检索全局记忆
                        </label>
                        <Switch
                          checked={config.searchGlobalMemory}
                          onCheckedChange={(v) =>
                            updateBuiltinToolConfig(toolType, {
                              searchGlobalMemory: v,
                            })
                          }
                        />
                      </div>

                      {/* 角色卡绑定 */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          角色卡绑定
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingType(toolType)}
                        >
                          {config.enabledForCharacters.length > 0
                            ? `${config.enabledForCharacters.length} 个角色卡`
                            : "全部角色卡"}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 角色卡绑定弹窗 */}
      <Dialog
        open={!!editingType}
        onOpenChange={(o) => !o && setEditingType(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              角色卡绑定 -{" "}
              {editingType && BUILTIN_TOOL_LABELS[editingType]}
            </DialogTitle>
            <DialogDescription>
              选择启用此工具的角色卡，不选则全局启用
            </DialogDescription>
          </DialogHeader>
          {editingConfig && characters.length > 0 ? (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-1 py-2">
                {characters.map((c) => {
                  const checked =
                    editingConfig.enabledForCharacters.includes(c.uuid);
                  return (
                    <label
                      key={c.uuid}
                      className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const set = new Set(
                            editingConfig.enabledForCharacters,
                          );
                          if (e.target.checked) set.add(c.uuid);
                          else set.delete(c.uuid);
                          updateBuiltinToolConfig(editingConfig.type, {
                            enabledForCharacters: Array.from(set),
                          });
                        }}
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              暂无角色卡
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setEditingType(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
