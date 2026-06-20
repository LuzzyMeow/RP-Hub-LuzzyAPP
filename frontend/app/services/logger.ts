/**
 * 日志系统（v0.3.0 新增）
 *
 * 记录应用启动到关闭全过程的关键事件：
 * - app: 启动/关闭
 * - agent: 工具调用
 * - api: 请求/响应状态
 * - user: 用户操作
 * - chat: 聊天事件（不记录内容）
 *
 * 存储路径：/Documents/LUZZY/logs/YYYYMMDD.log
 * 每次启动创建/追加当日 log 文件，启动时清理 3 天前的 log 文件
 *
 * 在 Web 环境下回退到 console，在 Capacitor 原生环境下写入文件系统
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 'app' | 'agent' | 'api' | 'user' | 'chat';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
}

/** 日志级别优先级 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 当前日志级别（可按需调整） */
let currentLogLevel: LogLevel = 'debug';

/** 内存中的日志缓冲区（用于 Web 环境或文件写入前的缓存） */
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 500;

/** 文件系统就绪标志 */
let filesystemReady = false;
/** 当日日志文件路径 */
let currentLogFile = '';

/**
 * 格式化时间戳：YYYY-MM-DD HH:mm:ss.SSS
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 获取日期字符串：YYYYMMDD
 */
function getDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * 格式化日志条目
 */
function formatLogEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
}

/**
 * 动态导入 Filesystem 并写入日志
 * 在 Web 环境下跳过文件写入
 */
async function writeToFile(entry: LogEntry): Promise<void> {
  if (!filesystemReady) return;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const line = formatLogEntry(entry) + '\n';
    const filename = `logs/${getDateString()}.log`;

    try {
      // 尝试追加写入
      await Filesystem.appendFile({
        path: filename,
        directory: Directory.Documents,
        data: line,
        encoding: Encoding.UTF8,
      });
    } catch {
      // 文件不存在时先创建（递归创建目录）
      try {
        await Filesystem.mkdir({
          path: 'logs',
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // 目录已存在，忽略
      }
      await Filesystem.writeFile({
        path: filename,
        directory: Directory.Documents,
        data: line,
        encoding: Encoding.UTF8,
      });
    }
    currentLogFile = filename;
  } catch (e) {
    // 文件写入失败时回退到 console
    console.warn('[Logger] 文件写入失败:', e);
  }
}

/**
 * 清理 3 天前的日志文件
 */
async function cleanOldLogs(): Promise<void> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const result = await Filesystem.readdir({
      path: 'logs',
      directory: Directory.Documents,
    }).catch(() => null);

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
        await Filesystem.deleteFile({
          path: `logs/${file.name}`,
          directory: Directory.Documents,
        }).catch(() => {});
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

/**
 * 初始化日志系统
 * 检测运行环境，如果是 Capacitor 原生环境则启用文件写入
 */
export async function initLogger(): Promise<void> {
  try {
    // 检测是否在 Capacitor 原生环境
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      filesystemReady = true;
      // 清理旧日志
      await cleanOldLogs();
      console.log('[Logger] 文件日志系统已初始化');
    }
  } catch {
    // Web 环境，仅使用 console
  }
  // 记录启动日志
  log('info', 'app', '应用启动');
}

/**
 * 获取当前日志文件路径
 */
export async function getLogFilePath(): Promise<string | null> {
  if (!filesystemReady) return null;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const filename = `logs/${getDateString()}.log`;
    const uri = await Filesystem.getUri({
      path: filename,
      directory: Directory.Documents,
    });
    return uri.uri;
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
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
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
  debug: (category: LogCategory, message: string) => log('debug', category, message),
  info: (category: LogCategory, message: string) => log('info', category, message),
  warn: (category: LogCategory, message: string) => log('warn', category, message),
  error: (category: LogCategory, message: string) => log('error', category, message),
};
