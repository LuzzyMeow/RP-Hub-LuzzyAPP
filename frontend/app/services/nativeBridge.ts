/**
 * 原生桥接封装层(方案 D:替代 @capacitor/* 插件)
 *
 * 在非原生平台(Web 浏览器)自动降级。
 * 原生平台通过 window.AndroidBridge.* 调用 NativeBridge.kt 的 JavascriptInterface 方法。
 */

declare global {
  interface Window {
    AndroidBridge?: {
      isNativePlatform: () => boolean;
      getDeviceInfo: () => string;
      writeFile: (
        directory: string,
        path: string,
        base64Data: string,
        recursive: boolean,
      ) => string;
      appendFile: (directory: string, path: string, text: string, encoding: string) => boolean;
      mkdir: (directory: string, path: string, recursive: boolean) => boolean;
      readdir: (directory: string, path: string) => string;
      deleteFile: (directory: string, path: string) => boolean;
      getUri: (directory: string, path: string) => string;
      shareFile: (uri: string, title: string, dialogTitle: string) => boolean;
      shareText: (text: string, title: string, dialogTitle: string) => boolean;
    };
    AndroidProxy?: {
      setApiConfig: (url: string, key: string) => void;
      setAdvancedSettings: (enableThinking: string, customRequestBody: string) => void;
    };
  }
}

export const isNativePlatform = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean(window.AndroidBridge?.isNativePlatform?.() ?? false);
};

export interface DeviceInfo {
  platform: string;
  manufacturer: string;
  model: string;
  osVersion: string;
  androidVersion: number;
  name: string;
}

export const getDeviceInfo = async (): Promise<DeviceInfo> => {
  if (!isNativePlatform()) {
    return {
      platform: "web",
      manufacturer: "",
      model: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      osVersion: "",
      androidVersion: 0,
      name: "Web Browser",
    };
  }
  const json = window.AndroidBridge!.getDeviceInfo();
  return JSON.parse(json) as DeviceInfo;
};

export const writeFile = async (
  directory: string,
  path: string,
  base64Data: string,
  recursive = true,
): Promise<{ uri?: string }> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  const uri = window.AndroidBridge!.writeFile(directory, path, base64Data, recursive);
  return { uri: uri || undefined };
};

export const appendFile = async (
  directory: string,
  path: string,
  text: string,
  encoding = "UTF-8",
): Promise<boolean> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  return window.AndroidBridge!.appendFile(directory, path, text, encoding);
};

export const mkdir = async (
  directory: string,
  path: string,
  recursive = true,
): Promise<boolean> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  return window.AndroidBridge!.mkdir(directory, path, recursive);
};

export const readdir = async (
  directory: string,
  path: string,
): Promise<{ files: Array<{ name: string }> }> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  const json = window.AndroidBridge!.readdir(directory, path);
  return JSON.parse(json) as { files: Array<{ name: string }> };
};

export const deleteFile = async (directory: string, path: string): Promise<boolean> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  return window.AndroidBridge!.deleteFile(directory, path);
};

export const getUri = async (directory: string, path: string): Promise<{ uri?: string }> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  const uri = window.AndroidBridge!.getUri(directory, path);
  return { uri: uri || undefined };
};

export const shareFile = async (
  uri: string,
  title = "分享文件",
  dialogTitle = "分享",
): Promise<void> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  window.AndroidBridge!.shareFile(uri, title, dialogTitle);
};

export const shareText = async (
  text: string,
  title = "分享文本",
  dialogTitle = "分享",
): Promise<void> => {
  if (!isNativePlatform()) throw new Error("Not native platform");
  window.AndroidBridge!.shareText(text, title, dialogTitle);
};
