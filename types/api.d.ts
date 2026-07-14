export interface Api {
  getConfig: () => Promise<Record<string, unknown>>;
  setConfig: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  cleanClipboard: () => Promise<Record<string, unknown>>;
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  closePreferences: () => void;
  openExternal: (url: string) => void;
  subscribeConfig: (callback: (config: Record<string, unknown>) => void) => () => void;
  onShowToast: (callback: (message: string) => void) => () => void;
  reportError: (err: Error | { message: string; stack?: string } | string) => void;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
