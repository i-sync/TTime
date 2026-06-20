export interface TranslateResultChannelApi {
  getTranslatedResultContent(): string
  setTranslatedResultContent(value: string): void
  clearTranslatedResultContentEvent(): void
  setShowResult(value: boolean): void
  setIsResultLoading(value: boolean): void
}

export interface TranslateServiceView {
  id: string
  type: string
  serviceName: string
  useStatus?: boolean
  checkStatus?: boolean
  serviceInfo: {
    name?: string
    logo: string
  }
}

export interface DictResultExpand {
  isPhonetic?: boolean
  phonetic?: string
  isUs?: boolean
  usPhonetic?: string
  usSpeech?: string
  isUk?: boolean
  ukPhonetic?: string
  ukSpeech?: string
  isExplainList?: boolean
  explainList?: Array<{ type?: string; content?: string }>
  isWfs?: boolean
  wfsList?: Array<{ wf: { name: string; value: string } }>
}
