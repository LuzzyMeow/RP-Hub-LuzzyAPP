/**
 * SKILL 技能管理服务
 *
 * 提供技能的导入（GitHub / Zip / 手动）、解析、持久化能力。
 *
 * 核心能力：
 * - 从 GitHub 导入 SKILL（支持镜像站加速、blob/tree 路径解析）
 * - 从 Zip 文件导入 SKILL（内置最小化 ZIP 解析器，无需第三方依赖）
 * - 手动解析 SKILL.md 内容（YAML frontmatter 或首个 Markdown 标题）
 * - 从 IndexedDB 加载/保存技能列表
 */

import type { Skill, SkillFileNode } from '~/types/luzzy';
import { v4 as uuidv4 } from 'uuid';
import { getItem, setItem } from '~/services/storage';

/** 技能列表在 IndexedDB 中的存储键 */
const SKILLS_STORAGE_KEY = 'all_skills';

/**
 * GitHub 镜像站列表
 *
 * 空字符串表示直连 GitHub（raw.githubusercontent.com）。
 * 导入时按顺序尝试，首个成功的镜像即返回结果。
 */
export const GITHUB_MIRRORS: string[] = [
  'https://ghproxy.com/',
  'https://mirror.ghproxy.com/',
  'https://gh-proxy.com/',
  '', // 直连 GitHub
];

/** SKILL.md 解析结果 */
export interface ParsedSkillMd {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 原始内容 */
  content: string;
}

// ============================================================================
// SKILL.md 解析
// ============================================================================

/**
 * 解析 SKILL.md 内容，提取元数据
 *
 * 支持两种格式：
 * 1. YAML frontmatter（--- 包裹的头部，含 name / description 字段）
 * 2. 首个 Markdown 标题（# 标题）作为名称，后续段落作为描述
 *
 * @param content - SKILL.md 文件内容
 * @returns 解析结果（name, description, content）
 */
export const parseSkillMd = (content: string): ParsedSkillMd => {
  const text = String(content || '');
  let name = '';
  let description = '';

  // 尝试解析 YAML frontmatter
  const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  // 若 frontmatter 无 name，尝试从首个 Markdown 标题提取
  if (!name) {
    const headingMatch = text.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      name = headingMatch[1].trim();
    }
  }

  // 若 frontmatter 无 description，尝试从首个标题后的段落提取
  if (!description) {
    // 移除 frontmatter 后取首个非空、非标题段落
    const body = frontmatterMatch ? text.slice(frontmatterMatch[0].length) : text;
    const lines = body.split('\n');
    let foundHeading = false;
    const descParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith('#')) {
        if (!foundHeading && !name) {
          foundHeading = true;
          continue;
        }
        if (descParts.length > 0) break;
        foundHeading = true;
        continue;
      }
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('---')) {
        descParts.push(trimmed);
        if (descParts.length >= 3) break;
      }
    }
    if (descParts.length > 0) {
      description = descParts.join(' ').slice(0, 200);
    }
  }

  return {
    name: name || '未命名技能',
    description: description || '',
    content: text,
  };
};

// ============================================================================
// GitHub 导入
// ============================================================================

/**
 * 解析 GitHub URL，提取 raw 文件路径
 *
 * 支持以下格式：
 * - https://github.com/user/repo/blob/branch/path/to/SKILL.md
 * - https://github.com/user/repo/tree/branch/path/to/dir（自动追加 /SKILL.md）
 * - https://raw.githubusercontent.com/user/repo/branch/path/to/SKILL.md
 *
 * @param url - GitHub URL
 * @returns raw URL 路径（如 user/repo/branch/path/to/SKILL.md），无法解析则返回 null
 */
const parseGithubUrl = (url: string): string | null => {
  const trimmed = url.trim();

  // 已是 raw.githubusercontent.com 格式
  const rawMatch = trimmed.match(
    /raw\.githubusercontent\.com\/([^?#]+)/,
  );
  if (rawMatch) return rawMatch[1];

  // github.com/user/repo/blob/branch/path 格式
  const blobMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  );
  if (blobMatch) {
    const [, user, repo, branch, path] = blobMatch;
    return `${user}/${repo}/${branch}/${path}`;
  }

  // github.com/user/repo/tree/branch/path 格式（目录，追加 SKILL.md）
  const treeMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
  );
  if (treeMatch) {
    const [, user, repo, branch, dirPath] = treeMatch;
    const basePath = dirPath.replace(/\/+$/, '');
    return `${user}/${repo}/${branch}/${basePath}/SKILL.md`;
  }

  // github.com/user/repo/tree/branch 格式（根目录）
  const treeRootMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/?#]+)$/,
  );
  if (treeRootMatch) {
    const [, user, repo, branch] = treeRootMatch;
    return `${user}/${repo}/${branch}/SKILL.md`;
  }

  return null;
};

/**
 * 从 GitHub 导入 SKILL
 *
 * 解析 GitHub URL 获取 raw 文件路径，依次尝试各镜像站（含直连）获取 SKILL.md 内容。
 * 成功后解析元数据并返回。
 *
 * @param url - GitHub URL（支持 blob/tree 路径）
 * @returns 解析后的 SKILL 内容与元数据
 * @throws 所有镜像均获取失败时抛出错误
 */
export const importSkillFromGithub = async (
  url: string,
): Promise<{ parsed: ParsedSkillMd; rawUrl: string }> => {
  const rawPath = parseGithubUrl(url);
  if (!rawPath) {
    throw new Error('无法解析 GitHub URL，请检查链接格式');
  }

  const rawBaseUrl = `https://raw.githubusercontent.com/${rawPath}`;
  let lastError: Error | null = null;

  // 依次尝试各镜像站
  for (const mirror of GITHUB_MIRRORS) {
    const fetchUrl = mirror ? `${mirror}${rawBaseUrl}` : rawBaseUrl;
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}: ${fetchUrl}`);
        continue;
      }
      const content = await response.text();
      if (!content.trim()) {
        lastError = new Error(`内容为空: ${fetchUrl}`);
        continue;
      }
      const parsed = parseSkillMd(content);
      return { parsed, rawUrl: rawBaseUrl };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error('所有镜像均获取失败');
};

/**
 * 解析 GitHub URL 为 owner/repo/branch 三元组
 *
 * @returns 成功返回 { owner, repo, branch, basePath }，失败返回 null
 */
const parseGithubRepoInfo = (
  url: string,
): { owner: string; repo: string; branch: string; basePath: string } | null => {
  const trimmed = url.trim();

  // github.com/user/repo/blob/branch/path
  const blobMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  );
  if (blobMatch) {
    const [, owner, repo, branch, path] = blobMatch;
    const lastSlash = path.lastIndexOf('/');
    const basePath = lastSlash > 0 ? path.slice(0, lastSlash) : '';
    return { owner, repo, branch, basePath };
  }

  // github.com/user/repo/tree/branch/path
  const treeMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
  );
  if (treeMatch) {
    const [, owner, repo, branch, path] = treeMatch;
    return { owner, repo, branch, basePath: path.replace(/\/+$/, '') };
  }

  // github.com/user/repo/tree/branch（根目录）
  const treeRootMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/?#]+)$/,
  );
  if (treeRootMatch) {
    const [, owner, repo, branch] = treeRootMatch;
    return { owner, repo, branch, basePath: '' };
  }

  // github.com/user/repo（默认 main 分支）
  const repoMatch = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)\/?$/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    return { owner, repo, branch: 'main', basePath: '' };
  }

  return null;
};

/**
 * 通过 GitHub API 获取仓库文件树
 *
 * 使用 GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 获取完整文件树。
 *
 * @param owner - 仓库 owner
 * @param repo - 仓库名
 * @param branch - 分支名
 * @returns 文件路径数组（仅 blob 类型）
 */
const fetchGithubFileTree = async (
  owner: string,
  repo: string,
  branch: string,
): Promise<string[]> => {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`GitHub API 请求失败: HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const tree = data.tree as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(tree)) return [];
  return tree
    .filter((item) => item.type === 'blob' && typeof item.path === 'string')
    .map((item) => String(item.path));
};

/**
 * 通过镜像站下载单个文件
 *
 * @param owner - 仓库 owner
 * @param repo - 仓库名
 * @param branch - 分支名
 * @param filePath - 文件路径
 * @returns 文件内容，失败返回 null
 */
const fetchGithubFile = async (
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string | null> => {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  const errors: string[] = [];
  for (const mirror of GITHUB_MIRRORS) {
    const fetchUrl = mirror ? `${mirror}${rawUrl}` : rawUrl;
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        errors.push(`${mirror || "direct"}: HTTP ${response.status}`);
        continue;
      }
      const content = await response.text();
      return content;
    } catch (e) {
      errors.push(`${mirror || "direct"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.warn("[fetchGithubFile] All mirrors failed:\n" + errors.join("\n"));
  return null;
};

/**
 * 从 GitHub 完整导入 SKILL（含所有附属文件）
 *
 * 1. 解析 GitHub URL 获取仓库信息
 * 2. 调用 GitHub API 获取完整文件树
 * 3. 过滤出 basePath 下的文件（排除 .git、node_modules 等）
 * 4. 依次下载每个文件，构建 SkillFileNode[] 树
 * 5. 解析 SKILL.md 元数据
 *
 * @param url - GitHub URL
 * @returns 文件树与解析后的 SKILL.md 元数据
 * @throws 解析失败或网络错误时抛出
 */
export const importSkillFromGithubFull = async (
  url: string,
): Promise<{ files: SkillFileNode[]; parsed: ParsedSkillMd; rawUrl: string }> => {
  const repoInfo = parseGithubRepoInfo(url);
  if (!repoInfo) {
    throw new Error('无法解析 GitHub URL，请检查链接格式');
  }
  const { owner, repo, branch, basePath } = repoInfo;

  // 获取完整文件树
  const allFiles = await fetchGithubFileTree(owner, repo, branch);

  // 过滤：basePath 下的文件，排除常见无用目录
  const excludePatterns = [/^\.git\//, /^node_modules\//, /^\.github\//];
  const skillFiles = allFiles.filter((path) => {
    const fullPath = basePath ? `${basePath}/${path}` : path;
    // 必须在 basePath 下
    if (basePath && !path.startsWith(`${basePath}/`) && path !== basePath) {
      return false;
    }
    // 排除无用目录
    if (excludePatterns.some((p) => p.test(fullPath))) return false;
    return true;
  });

  if (skillFiles.length === 0) {
    throw new Error('仓库中未找到任何文件');
  }

  // 下载所有文件
  const filesWithData: Array<{ path: string; content?: string }> = [];
  for (const filePath of skillFiles) {
    const content = await fetchGithubFile(owner, repo, branch, filePath);
    // 相对路径：剥离 basePath 前缀
    const relativePath = basePath && filePath.startsWith(`${basePath}/`)
      ? filePath.slice(basePath.length + 1)
      : filePath;
    filesWithData.push({
      path: relativePath,
      content: content ?? undefined,
    });
  }

  // 构建文件树
  const fileTree = buildFileTree(filesWithData);

  // 找到 SKILL.md 并解析
  const skillMdFile = filesWithData.find(
    (f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'),
  );
  if (!skillMdFile?.content) {
    throw new Error('仓库中未找到 SKILL.md 文件');
  }
  const parsed = parseSkillMd(skillMdFile.content);
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillMdFile.path}`;

  return { files: fileTree, parsed, rawUrl };
};

// ============================================================================
// Zip 导入
// ============================================================================

/** ZIP End of Central Directory 签名 */
const ZIP_EOCD_SIGNATURE = 0x06054b50;
/** ZIP Central Directory File Header 签名 */
const ZIP_CDFH_SIGNATURE = 0x02014b50;
/** ZIP Local File Header 签名 */
const ZIP_LFH_SIGNATURE = 0x04034b50;

/** ZIP 中央目录条目信息 */
interface ZipCentralEntry {
  /** 压缩方法（0=stored, 8=deflate） */
  compressionMethod: number;
  /** 压缩大小 */
  compressedSize: number;
  /** 未压缩大小 */
  uncompressedSize: number;
  /** 文件名 */
  fileName: string;
  /** 本地文件头偏移 */
  localHeaderOffset: number;
}

/**
 * 查找 End of Central Directory 记录
 *
 * 从文件末尾向前搜索 EOCD 签名（最多搜索 64KB + 22 字节）。
 *
 * @param buffer - ArrayBuffer
 * @returns EOCD 偏移量，未找到返回 -1
 */
const findEocdOffset = (buffer: ArrayBuffer): number => {
  const view = new DataView(buffer);
  const maxSearch = Math.min(buffer.byteLength - 22, 65557);
  for (let i = buffer.byteLength - 22; i >= maxSearch; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIGNATURE) {
      return i;
    }
  }
  // 如果文件较小，从头搜索
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
};

/**
 * 解析 ZIP 中央目录，获取所有文件条目
 *
 * @param buffer - ArrayBuffer
 * @returns 中央目录条目数组
 */
const parseCentralDirectory = (buffer: ArrayBuffer): ZipCentralEntry[] => {
  const view = new DataView(buffer);
  const eocdOffset = findEocdOffset(buffer);
  if (eocdOffset === -1) {
    throw new Error('无效的 ZIP 文件：未找到 End of Central Directory 记录');
  }

  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);

  const entries: ZipCentralEntry[] = [];
  let offset = cdOffset;

  for (let i = 0; i < totalEntries && offset < cdOffset + cdSize; i++) {
    if (view.getUint32(offset, true) !== ZIP_CDFH_SIGNATURE) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const fileNameBytes = new Uint8Array(
      buffer,
      offset + 46,
      fileNameLength,
    );
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes);

    entries.push({
      compressionMethod,
      compressedSize,
      uncompressedSize,
      fileName,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
};

/**
 * 从 ZIP 中提取单个文件的原始数据（解压后）
 *
 * 支持 stored（method 0）和 deflate（method 8）两种压缩方式。
 * deflate 使用浏览器内置的 DecompressionStream('deflate-raw')。
 *
 * @param buffer - ArrayBuffer
 * @param entry - 中央目录条目
 * @returns 解压后的 Uint8Array
 */
const extractZipEntry = async (
  buffer: ArrayBuffer,
  entry: ZipCentralEntry,
): Promise<Uint8Array> => {
  const view = new DataView(buffer);
  const lfhOffset = entry.localHeaderOffset;

  if (view.getUint32(lfhOffset, true) !== ZIP_LFH_SIGNATURE) {
    throw new Error(`无效的本地文件头: ${entry.fileName}`);
  }

  const fileNameLength = view.getUint16(lfhOffset + 26, true);
  const extraFieldLength = view.getUint16(lfhOffset + 28, true);
  const dataOffset = lfhOffset + 30 + fileNameLength + extraFieldLength;

  const compressedData = new Uint8Array(
    buffer,
    dataOffset,
    entry.compressedSize,
  );

  if (entry.compressionMethod === 0) {
    // stored：无压缩
    return compressedData;
  }

  if (entry.compressionMethod === 8) {
    // deflate：使用浏览器内置 DecompressionStream
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('浏览器不支持 DecompressionStream，无法解压 deflate 数据');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedData);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  throw new Error(`不支持的压缩方法: ${entry.compressionMethod}`);
};

/**
 * 将扁平文件路径列表构建为树形结构
 *
 * @param files - 文件路径与内容数组
 * @returns 树形根节点数组
 */
const buildFileTree = (
  files: Array<{ path: string; content?: string }>,
): SkillFileNode[] => {
  const root: SkillFileNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) continue;

    let currentLevel = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find((n) => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: fullPath,
          isDirectory: !isLast,
          children: isLast ? undefined : [],
          content: isLast ? file.content : undefined,
        };
        currentLevel.push(existing);
      }
      if (!isLast) {
        if (!existing.children) existing.children = [];
        currentLevel = existing.children;
      }
    }
  }

  return root;
};

/**
 * 从 Zip 文件导入 SKILL
 *
 * 解析 ZIP 文件结构，找到最外层目录的 SKILL.md，
 * 提取所有文件内容并构建树形结构。
 *
 * @param file - File 对象（.zip 文件）
 * @returns 文件树与解析后的 SKILL.md 元数据
 * @throws ZIP 解析失败或未找到 SKILL.md 时抛出错误
 */
export const importSkillFromZip = async (
  file: File,
): Promise<{ files: SkillFileNode[]; parsed: ParsedSkillMd }> => {
  const buffer = await file.arrayBuffer();
  const entries = parseCentralDirectory(buffer);

  // 过滤目录条目（以 / 结尾）和空文件
  const fileEntries = entries.filter(
    (e) => !e.fileName.endsWith('/') && e.uncompressedSize > 0,
  );

  if (fileEntries.length === 0) {
    throw new Error('ZIP 文件中无可用文件');
  }

  // 提取所有文件内容
  const extractedFiles: Array<{ path: string; content: string }> = [];
  for (const entry of fileEntries) {
    try {
      const data = await extractZipEntry(buffer, entry);
      const content = new TextDecoder('utf-8').decode(data);
      // 去除路径中的顶层目录前缀用于查找 SKILL.md
      extractedFiles.push({ path: entry.fileName, content });
    } catch (e) {
      console.warn(`[Skill] 解压失败: ${entry.fileName}`, e);
    }
  }

  if (extractedFiles.length === 0) {
    throw new Error('ZIP 文件中所有文件解压失败');
  }

  // 查找最外层的 SKILL.md（顶层目录或第一层子目录下）
  let skillMdContent: string | null = null;
  // 优先查找根目录的 SKILL.md
  const rootSkill = extractedFiles.find(
    (f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'),
  );
  if (rootSkill) {
    skillMdContent = rootSkill.content;
  } else {
    // 查找任意层级的 SKILL.md（取路径最短的）
    const allSkills = extractedFiles
      .filter((f) => f.path.split('/').pop()?.toUpperCase() === 'SKILL.MD')
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    if (allSkills.length > 0) {
      skillMdContent = allSkills[0].content;
    }
  }

  if (!skillMdContent) {
    throw new Error('ZIP 文件中未找到 SKILL.md');
  }

  const parsed = parseSkillMd(skillMdContent);
  const fileTree = buildFileTree(extractedFiles);

  return { files: fileTree, parsed };
};

// ============================================================================
// 手动导入
// ============================================================================

/**
 * 手动导入 SKILL（直接粘贴 SKILL.md 内容）
 *
 * @param content - SKILL.md 文件内容
 * @returns 解析后的 SKILL 元数据
 */
export const importSkillManual = (content: string): ParsedSkillMd => {
  return parseSkillMd(content);
};

// ============================================================================
// 持久化
// ============================================================================

/**
 * 从 IndexedDB 加载所有技能
 *
 * @returns 技能列表，不存在则返回空数组
 */
export const loadSkills = async (): Promise<Skill[]> => {
  const data = await getItem<Skill[]>('skills', SKILLS_STORAGE_KEY);
  return data ?? [];
};

/**
 * 保存技能列表到 IndexedDB
 *
 * @param skills - 技能列表
 */
export const saveSkills = async (skills: Skill[]): Promise<void> => {
  await setItem('skills', SKILLS_STORAGE_KEY, skills);
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建新的 Skill 对象
 *
 * @param parsed - 解析后的 SKILL.md 元数据
 * @param source - 导入来源
 * @param files - 文件树
 * @param githubUrl - GitHub URL（可选）
 * @returns Skill 对象
 */
export const createSkill = (
  parsed: ParsedSkillMd,
  source: 'github' | 'zip' | 'manual',
  files: SkillFileNode[] = [],
  githubUrl?: string,
): Skill => {
  const now = Date.now();
  return {
    id: uuidv4(),
    name: parsed.name,
    description: parsed.description,
    source,
    githubUrl,
    files,
    tags: [],
    enabledForCharacters: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
};
