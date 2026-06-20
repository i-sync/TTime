export interface TranslateInputApi {
  getTranslateContent(): string
  setTranslateContent(value: string): void
  clearTranslatedContentEvent(): void
  translateFun(): void
  translateDualPolishCompareFun(): void
}

export interface TranslateResultPanelApi {
  getPrimaryResultContent(): string
  setPrimaryResultContent(value: string): void
  clearTranslatedResultContentEvent(): void
  setShowResult(value: boolean): void
  setIsResultLoading(value: boolean): void
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
