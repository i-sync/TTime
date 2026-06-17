import TranslateModeEnum from '../../../common/enums/TranslateModeEnum'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'
import LanguageEnum from '../enums/LanguageEnum'
import { cacheGet, cacheSet } from './cacheUtil'
import { getTranslateServiceMapByUse } from './translateServiceUtil'
import { findLanguageByLanguageName } from '../translate/components/channel/language/ChannelLanguage'
import { getLanguageNameConversion, getLanguageResultNameConversion } from './languageUtil'
import { isNull } from '../../../common/utils/validate'
import {
  getBoundServiceForMode,
  getModeServiceBindings,
  restoreModeLanguagePair,
  saveCurrentModeLanguagePair,
  setModeServiceBinding
} from './translateModeConfigUtil'

export const PSEUDO_LANGUAGE_NAMES = ['文字润色', '总结', '分析', '解释代码']

const AI_SERVICE_TYPES = [
  TranslateServiceEnum.OPEN_AI,
  TranslateServiceEnum.AZURE_OPEN_AI,
  TranslateServiceEnum.TTIME_AI
]

export function isAiTranslateService(serviceType: string): boolean {
  return AI_SERVICE_TYPES.includes(serviceType)
}

export type BindingFallback = {
  mode: string
  bindingId: string
  message: string
}

export type ActiveServicesResult = {
  services: any[]
  bindingFallback?: BindingFallback
}

const MODE_PRIORITY: Record<string, string[]> = {
  [TranslateModeEnum.POLISH]: [...AI_SERVICE_TYPES],
  [TranslateModeEnum.COMPARE]: [
    TranslateServiceEnum.DEEP_L_BUILT_IN,
    TranslateServiceEnum.DEEP_L,
    ...AI_SERVICE_TYPES
  ],
  [TranslateModeEnum.TRANSLATE]: [...AI_SERVICE_TYPES]
}

const MODE_LANGUAGE_PAIRS: Record<string, { input: string; result: string }> = {
  [TranslateModeEnum.POLISH]: {
    input: LanguageEnum.ENGLISH_CONVERSION,
    result: LanguageEnum.ENGLISH_CONVERSION
  },
  [TranslateModeEnum.COMPARE]: {
    input: LanguageEnum.ENGLISH_CONVERSION,
    result: LanguageEnum.CHINESE_CONVERSION
  },
  [TranslateModeEnum.TRANSLATE]: {
    input: LanguageEnum.CHINESE_CONVERSION,
    result: LanguageEnum.ENGLISH_CONVERSION
  }
}

export function getTranslateMode(): string {
  const mode = cacheGet('translateMode')
  if (isNull(mode) || !TranslateModeEnum.ALL.includes(mode)) {
    return TranslateModeEnum.DEFAULT
  }
  return mode
}

export function setTranslateMode(mode: string): void {
  const previousMode = getTranslateMode()
  if (previousMode !== mode) {
    saveCurrentModeLanguagePair(previousMode)
  }
  cacheSet('translateMode', mode)
  if (!restoreModeLanguagePair(mode)) {
    applyModeLanguageDefaults(mode)
    saveCurrentModeLanguagePair(mode)
  }
}

export function applyModeLanguageDefaults(mode: string): void {
  const pair = MODE_LANGUAGE_PAIRS[mode]
  if (!pair) {
    return
  }
  const inputLang = findLanguageByLanguageName(pair.input)
  const resultLang = findLanguageByLanguageName(pair.result)
  if (inputLang) {
    cacheSet('inputLanguage', inputLang)
  }
  if (resultLang) {
    cacheSet('resultLanguage', resultLang)
  }
}

export function initTranslateMode(): void {
  if (cacheGet('translateMode') === undefined) {
    setTranslateMode(TranslateModeEnum.DEFAULT)
  }
}

/**
 * 模式 UI 启用后隐藏伪语言项；findLanguageByLanguageName 仍查全量列表以兼容旧配置
 */
export function shouldFilterPseudoLanguages(): boolean {
  return cacheGet('translateMode') !== undefined
}

function sortByPriority(services: any[], mode: string): any[] {
  const priority = MODE_PRIORITY[mode] || []
  return [...services].sort((a, b) => {
    const ia = priority.indexOf(a.type)
    const ib = priority.indexOf(b.type)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

const bindingFallbackWarnedKeys = new Set<string>()

/**
 * 返回是否应向用户展示绑定回退提示（由 Input.vue translateFun 调用，避免 UI 初始化误弹）
 */
export function shouldNotifyBindingFallback(fallback: BindingFallback): boolean {
  const key = `${fallback.mode}:${fallback.bindingId}`
  if (bindingFallbackWarnedKeys.has(key)) {
    return false
  }
  bindingFallbackWarnedKeys.add(key)
  return true
}

export function clearBindingFallbackWarnCache(): void {
  bindingFallbackWarnedKeys.clear()
}

function isServiceAllowedForMode(service: { type: string }, mode: string): boolean {
  const allowedTypes = MODE_PRIORITY[mode] || []
  return allowedTypes.includes(service.type)
}

/**
 * 获取某模式下可绑定的已启用翻译源
 */
export function getBindableServicesForMode(mode: string): any[] {
  const allowedTypes = new Set(MODE_PRIORITY[mode] || [])
  return [...getTranslateServiceMapByUse().values()].filter((service) =>
    allowedTypes.has(service.type)
  )
}

function resolveDefaultServicesForMode(translateMode: string, allServices: any[]): any[] {
  let filtered: any[]

  if (translateMode === TranslateModeEnum.POLISH || translateMode === TranslateModeEnum.TRANSLATE) {
    filtered = allServices.filter((s) => AI_SERVICE_TYPES.includes(s.type))
  } else if (translateMode === TranslateModeEnum.COMPARE) {
    const deepLBuiltIn = allServices.find((s) => s.type === TranslateServiceEnum.DEEP_L_BUILT_IN)
    const deepL = allServices.find((s) => s.type === TranslateServiceEnum.DEEP_L)
    if (deepLBuiltIn) {
      filtered = [deepLBuiltIn]
    } else if (deepL) {
      filtered = [deepL]
    } else {
      filtered = allServices.filter((s) => AI_SERVICE_TYPES.includes(s.type))
    }
  } else {
    filtered = allServices
  }

  return sortByPriority(filtered, translateMode)
}

function fallbackAfterInvalidBinding(
  translateMode: string,
  bindingId: string,
  message: string
): ActiveServicesResult {
  setModeServiceBinding(translateMode, '')
  const allServices = [...getTranslateServiceMapByUse().values()]
  return {
    services: resolveDefaultServicesForMode(translateMode, allServices),
    bindingFallback: { mode: translateMode, bindingId, message }
  }
}

/**
 * 解析当前模式下参与翻译的源（无 UI 副作用；无效绑定时会写 cache 清除）
 */
export function resolveActiveServicesForMode(mode?: string): ActiveServicesResult {
  const translateMode = mode || getTranslateMode()
  const bindingId = getModeServiceBindings()[translateMode]
  const boundService = getBoundServiceForMode(translateMode)
  if (!isNull(bindingId) && bindingId !== '') {
    if (!boundService) {
      return fallbackAfterInvalidBinding(
        translateMode,
        bindingId,
        '绑定的翻译源未启用或验证失败，已回退自动路由'
      )
    }
    if (!isServiceAllowedForMode(boundService, translateMode)) {
      return fallbackAfterInvalidBinding(
        translateMode,
        bindingId,
        `「${translateMode}」模式的绑定翻译源类型不兼容，已回退自动路由`
      )
    }
    return { services: [boundService] }
  }
  const allServices = [...getTranslateServiceMapByUse().values()]
  return { services: resolveDefaultServicesForMode(translateMode, allServices) }
}

/**
 * 获取当前模式下参与翻译的源（按优先级排序）
 */
export function getActiveServicesForMode(mode?: string): any[] {
  return resolveActiveServicesForMode(mode).services
}

export function getPrimaryServiceForMode(mode?: string): any | null {
  const active = getActiveServicesForMode(mode)
  return active.length > 0 ? active[0] : null
}

/**
 * TTimeAI 仍使用服务端约定的伪语言类型；OpenAI/Azure 使用真实语言 + translateMode
 */
export function resolveLanguageTypesForService(
  serviceType: string,
  translateMode: string,
  inputLanguage: object,
  resultLanguage: object
): { languageInputType: string; languageResultType: string } | null {
  if (serviceType === TranslateServiceEnum.TTIME_AI) {
    if (translateMode === TranslateModeEnum.POLISH) {
      const inputSvc = inputLanguage?.serviceList?.find((s) => s.type === serviceType)
      return {
        languageInputType: inputSvc?.languageType || 'English',
        languageResultType: '文字润色'
      }
    }
  }

  const inputSvc = inputLanguage?.serviceList?.find((s) => s.type === serviceType)
  const resultSvc = resultLanguage?.serviceList?.find((s) => s.type === serviceType)
  if (!inputSvc || !resultSvc) {
    return null
  }
  return {
    languageInputType: inputSvc.languageType,
    languageResultType: resultSvc.languageType
  }
}

export function resolveLanguagesForTranslate(
  translateContent: string,
  translateMode: string
): { inputLanguage: object; resultLanguage: object } {
  let inputLanguage = cacheGet('inputLanguage')
  let resultLanguage = cacheGet('resultLanguage')

  if (translateMode === TranslateModeEnum.POLISH) {
    inputLanguage = findLanguageByLanguageName(LanguageEnum.ENGLISH_CONVERSION)
    resultLanguage = findLanguageByLanguageName(LanguageEnum.ENGLISH_CONVERSION)
  } else if (inputLanguage?.languageType === LanguageEnum.AUTO) {
    const name = getLanguageNameConversion(translateContent)
    inputLanguage = findLanguageByLanguageName(name)
  }

  if (
    translateMode === TranslateModeEnum.COMPARE &&
    resultLanguage?.languageType === LanguageEnum.AUTO
  ) {
    resultLanguage = findLanguageByLanguageName(LanguageEnum.CHINESE_CONVERSION)
  } else if (
    translateMode === TranslateModeEnum.TRANSLATE &&
    resultLanguage?.languageType === LanguageEnum.AUTO
  ) {
    resultLanguage = findLanguageByLanguageName(LanguageEnum.ENGLISH_CONVERSION)
  } else if (
    translateMode !== TranslateModeEnum.POLISH &&
    resultLanguage?.languageType === LanguageEnum.AUTO
  ) {
    const name = getLanguageResultNameConversion(translateContent)
    resultLanguage = findLanguageByLanguageName(name)
  }

  return { inputLanguage, resultLanguage }
}

/**
 * 解析 AUTO 并写回 cache（用于切换前）
 */
export function resolveAndPersistAutoLanguage(translateContent: string): void {
  const inputLanguage = cacheGet('inputLanguage')
  const resultLanguage = cacheGet('resultLanguage')

  if (inputLanguage?.languageType === LanguageEnum.AUTO && translateContent) {
    const name = getLanguageNameConversion(translateContent)
    const resolved = findLanguageByLanguageName(name)
    if (resolved) {
      cacheSet('inputLanguage', resolved)
    }
  }
  if (resultLanguage?.languageType === LanguageEnum.AUTO && translateContent) {
    const name = getLanguageResultNameConversion(translateContent)
    const resolved = findLanguageByLanguageName(name)
    if (resolved) {
      cacheSet('resultLanguage', resolved)
    }
  }
}

export function getEmptyModeMessage(mode: string): string {
  if (mode === TranslateModeEnum.COMPARE) {
    return '当前模式无可用翻译源，请在设置中启用 DeepL 内置或添加 OpenAI 翻译源'
  }
  return '当前模式无可用翻译源，请在设置中添加 OpenAI、AzureOpenAI 或 TTimeAI 翻译源'
}

export function isPolishMode(): boolean {
  return getTranslateMode() === TranslateModeEnum.POLISH
}
