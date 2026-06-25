/**
 * 日志系统（v0.3.0 新增）
 *
 * 记录应用启动到关闭全过程的关键事件：
 * - app: 启动/关闭
 * - agent: 工具调用
 * - api: 请求/响应状态
 * - user: 用户操作
 * - chat: 聊天事件（不记录内容）
 * - memory: 记忆操作（v0.4.1 新增）
 * - world: 世界书操作（v0.4.1 新增）
 * - tool: 工具调用详情（v0.4.1 新增）
 * - stream: 流式输出诊断（v0.4.6 新增）
 * - trpg: TRPG 模式事件（v0.8.0 新增）
 * - preset: 预设内容变更
 * - tool_version: 内置工具/SKILL/MCP 版本变更（v0.8.11 新增）
 *
 * 存储路径：/Documents/LUZZY/logs/YYYYMMDD.log
 * 每次启动创建/追加当日 log 文件，启动时清理 3 天前的 log 文件
 *
 * 在 Web 环境下回退到 console，在 Capacitor 原生环境下写入文件系统
 */

type LogLevel = "debug" | "info" | "warn" | "error";
// v0.8.11: 新增 "tool_version" 分类
// 该分类专门用于记录内置工具 / SKILL / MCP 工具的版本变更、加载状态、协议升级等事件。
// 关联约束（项目硬性要求，禁止删除）：
//   1. 一旦涉及内置工具（包括但不限于 SKILL 工具、MCP 工具、内置工具等内容）的更新，
//      必须同步升级关于页 - 日志的日志功能以记录新版本工具的 log；
//   2. 关于页 CATEGORY_TABS 中必须保留 "tool_version" 分类 Tab 供用户筛选；
//   3. 此分类与 "tool"（工具调用详情）语义不同：tool 记录运行期调用，
//      tool_version 记录工具集合本身的版本与协议演化。禁止合并或移除。
type LogCategory =
  | "app"
  | "agent"
  | "api"
  | "user"
  | "chat"
  | "memory"
  | "world"
  | "tool"
  | "stream"
  | "trpg"
  | "preset"
  | "tool_version";
export type { LogLevel, LogCategory };

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
}
export type { LogEntry };

/** 日志级别优先级 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 当前日志级别（可按需调整） */
let currentLogLevel: LogLevel = "debug";

/** 内存中的日志缓冲区（用于 Web 环境或文件写入前的缓存） */
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 2000;

/** 文件系统就绪标志 */
let filesystemReady = false;
/** 当日日志文件路径 */
let currentLogFile = "";

/**
 * 格式化时间戳：YYYY-MM-DD HH:mm:ss.SSS
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 获取日期字符串：YYYYMMDD
 */
function getDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * 格式化日志条目
 */
function formatLogEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
}

/**
 * 动态导入 NativeBridge 并写入日志
 * 在 Web 环境下跳过文件写入
 */
async function writeToFile(entry: LogEntry): Promise<void> {
  if (!filesystemReady) return;
  try {
    const { appendFile, mkdir, writeFile } = await import("~/services/nativeBridge");
    const line = formatLogEntry(entry) + "\n";
    const filename = `logs/${getDateString()}.log`;

    try {
      // 尝试追加写入
      await appendFile("DOCUMENTS", filename, line, "UTF-8");
    } catch {
      // 文件不存在时先创建(递归创建目录)
      try {
        await mkdir("DOCUMENTS", "logs", true);
      } catch {
        // 目录已存在,忽略
      }
      // writeFile 接受 base64 数据,需将文本转 base64(处理 UTF-8 中文)
      await writeFile("DOCUMENTS", filename, btoa(unescape(encodeURIComponent(line))), true);
    }
    currentLogFile = filename;
  } catch (e) {
    // 文件写入失败时回退到 console
    console.warn("[Logger] 文件写入失败:", e);
  }
}

/**
 * 清理 3 天前的日志文件
 */
async function cleanOldLogs(): Promise<void> {
  try {
    const { readdir, deleteFile } = await import("~/services/nativeBridge");
    const result = await readdir("DOCUMENTS", "logs").catch(() => null);

    if (!result) return;

    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    for (const file of result.files) {
      // 从文件名解析日期 YYYYMMDD.log
      const match = file.name.match(/^(\d{8})\.log$/);
      if (!match) continue;
      const fileDate = new Date(
        parseInt(match[1].substring(0, 4)),
        parseInt(match[1].substring(4, 6)) - 1,
        parseInt(match[1].substring(6, 8)),
      );
      if (fileDate.getTime() < threeDaysAgo) {
        await deleteFile("DOCUMENTS", `logs/${file.name}`).catch(() => {});
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

/**
 * 初始化日志系统
 * 检测运行环境,如果是原生环境则启用文件写入
 */
export async function initLogger(): Promise<void> {
  try {
    // v0.4.5: 方案 D - 使用 NativeBridge 检测原生平台
    const { isNativePlatform } = await import("~/services/nativeBridge");
    if (isNativePlatform()) {
      filesystemReady = true;
      // 清理旧日志
      await cleanOldLogs();
      console.log("[Logger] 文件日志系统已初始化");
    }
  } catch {
    // Web 环境,仅使用 console
  }
  // 记录启动日志
  log("info", "app", "应用启动");

  // v0.8.11: 工具系统版本启动日志
  // 关联硬性约束：涉及内置工具更新时必须同步升级关于页-日志功能以记录新版本工具 log。
  // 此日志用于在关于页"工具版本"分类下确认工具协议版本与初始化时点，便于排查工具调用丢失/解析失败问题。
  // 禁止删除：这是项目硬性要求中"内置工具更新必须同步升级日志"的落地实现之一。
  // 注意：当内置工具/SKILL/MCP 协议升级时，必须同步修改下面的版本号与协议说明，保持日志与实际代码一致。
  log(
    "info",
    "tool_version",
    "LUZZY v0.8.13 工具系统初始化完成 | 协议: 原生 tool_calls + <tool_calls> 文本标签兜底 | Agentic: 2 轮思考 + 1 轮主动工具调用强制 | parseToolCallsFromText 统一于 toolService.ts",
  );
}

/**
 * 获取当前日志文件路径
 */
export async function getLogFilePath(): Promise<string | null> {
  if (!filesystemReady) return null;
  try {
    const { getUri } = await import("~/services/nativeBridge");
    const filename = `logs/${getDateString()}.log`;
    const { uri } = await getUri("DOCUMENTS", filename);
    return uri ?? null;
  } catch {
    return null;
  }
}

/**
 * 获取内存缓冲区中的日志（用于关于页显示）
 */
export function getBufferedLogs(): LogEntry[] {
  return [...logBuffer];
}

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * 核心日志函数
 */
function log(level: LogLevel, category: LogCategory, message: string): void {
  // 级别过滤
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLogLevel]) return;

  const entry: LogEntry = {
    timestamp: formatTimestamp(new Date()),
    level,
    category,
    message,
  };

  // 写入 console
  const formatted = formatLogEntry(entry);
  switch (level) {
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
      console.error(formatted);
      break;
  }

  // 写入内存缓冲区
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // 异步写入文件（不阻塞）
  void writeToFile(entry);
}

/** 导出日志函数 */
export const logger = {
  debug: (category: LogCategory, message: string) => log("debug", category, message),
  info: (category: LogCategory, message: string) => log("info", category, message),
  warn: (category: LogCategory, message: string) => log("warn", category, message),
  error: (category: LogCategory, message: string) => log("error", category, message),
};
