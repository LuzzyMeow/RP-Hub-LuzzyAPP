/**
 * 将文件 URL 转换为正确的可访问路径
 * - data: URL（base64）直接返回
 * - http/https URL（外部文件）直接返回
 * - file:// URL（Android 本地文件）提取路径并转换为 /api/files/path/{path}
 * - 相对路径转换为 /api/files/path/{path}
 */
export function resolveFileUrl(url: string): string {
  if (url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Handle file:// protocol URLs from Android
  if (url.startsWith("file://")) {
    // Format: file:///data/user/0/package.name/files/upload/xxx
    const match = url.match(/file:\/\/.*?\/files\/(.+)/);
    if (match && match[1]) {
      return `/api/files/path/${match[1]}`;
    }
    // If we can't extract the path, return as-is (will fail to load with error)
    return url;
  }

  // Relative path - convert to API endpoint
  // Remove leading slash if present
  const path = url.startsWith("/") ? url.slice(1) : url;
  return `/api/files/path/${path}`;
}
