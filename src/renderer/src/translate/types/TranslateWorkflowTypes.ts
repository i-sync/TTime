export interface TranslateInputApi {
  getTranslateContent(): string
  setTranslateContent(value: string): void
  translateFun(): void
  translateDualPolishCompareFun(): void
}

export interface TranslateResultPanelApi {
  getPrimaryResultContent(): string
  setPrimaryResultContent(value: string): void
  setActiveServiceIds(ids: string[], clearInactive?: boolean): void
  setServiceModeLabels(labels: Record<string, string>): void
}

export interface LanguageSelectApi {
  syncFromCache(): void
}

export interface TranslateWorkflowDeps {
  getInput: () => TranslateInputApi | undefined
  getResult: () => TranslateResultPanelApi | undefined
  getLanguageSelect: () => LanguageSelectApi | undefined
  onModeSync: () => void
}
