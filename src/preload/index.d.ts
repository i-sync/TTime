import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface api {
    windowHeightChangeEvent(callback?: () => void): void
    updateTranslateContentEvent(callback: (content: string, source?: string) => void): void
    clearAllTranslateContentEvent(callback: () => void): void
    pageHeightChangeEvent(): void
    openSetPageEvent(): void
    alwaysOnTopEvent(status: boolean): void
    windowHeightChangeMaxEvent(): void
    logInfoEvent(...args: unknown[]): void
    logErrorEvent(...args: unknown[]): void
    screenshotEndNotifyEvent(callback: () => void): void
    winShowEvent(callback: () => void): void
    winShowByInputEvent(callback: () => void): void
    apiUniteTranslate(type: string, info: object): void
    apiOpenAIStreamTranslate(payload: object): Promise<void>
    apiOpenAICheckTranslate(payload: object): Promise<void>
    showMsgEvent(callback: (type: string, msg: string) => void): void
    updateTranslateServiceEvent(callback: () => void): void
    updateTranslateServiceNotify(): void
    apiTranslateResultMsgCallbackEvent(channel: string, msg: string): void
    agentApiTranslateCallback(res: object): void
    agentApiOcr(info: object): void
    agentApiOcrCallback(res: object): void
    updateCacheEvent(callback: () => void): void
    ttimeApiAppStart(): void
    ttimeApiTranslateUse(): void
    winFontSizeNotify(callback?: () => void): void
    winSizeUpdate(callback: (newBounds: { width: number; height: number }) => void): void
  }

  interface Window {
    electron: ElectronAPI
    api: api
  }
}
