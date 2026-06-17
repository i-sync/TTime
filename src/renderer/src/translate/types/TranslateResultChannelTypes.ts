export interface TranslateResultChannelApi {
  getTranslatedResultContent(): string
  setTranslatedResultContent(value: string): void
  clearTranslatedResultContentEvent(): void
  setShowResult(value: boolean): void
  setIsResultLoading(value: boolean): void
}
