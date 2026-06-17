import TranslateModeEnum from '../../../common/enums/TranslateModeEnum'
import { isNotNull, isNull } from '../../../common/utils/validate'
import { YesNoEnum } from '../../../common/enums/YesNoEnum'
import TranslateRecordVo from '../../../common/class/TranslateRecordVo'
import { getCustomRolePrompt } from './translateModeConfigUtil'
import {
  type BindingFallback,
  getEmptyModeMessage,
  isAiTranslateService,
  resolveActiveServicesForMode,
  resolveLanguageTypesForService,
  resolveLanguagesForTranslate,
  shouldNotifyBindingFallback
} from './translateModeUtil'
import { TranslateServiceBuilder } from './translateServiceUtil'
import ElMessageExtend from './messageExtend'

export type TranslateRequestPayload = Record<string, unknown>

export type TranslateExecutionPlan = {
  requestMap: Map<string, TranslateRequestPayload>
  activeServiceIds: string[]
  serviceModeLabels: Record<string, string>
  modesFulfilled: string[]
  polishServiceId?: string
  compareServiceId?: string
  partialDualMessage?: string
  bindingFallback?: BindingFallback
  translateRecordVo: ReturnType<typeof TranslateRecordVo.build> | null
  emptyMessage?: string
}

function buildPartialDualMessage(modes: string[], modesFulfilled: string[]): string | undefined {
  const wantsPolish = modes.includes(TranslateModeEnum.POLISH)
  const wantsCompare = modes.includes(TranslateModeEnum.COMPARE)
  if (!wantsPolish || !wantsCompare) {
    return undefined
  }
  const hasPolish = modesFulfilled.includes(TranslateModeEnum.POLISH)
  const hasCompare = modesFulfilled.includes(TranslateModeEnum.COMPARE)
  if (hasPolish && hasCompare) {
    return undefined
  }
  if (!hasPolish && hasCompare) {
    return '未配置润色源，仅输出对照结果'
  }
  if (hasPolish && !hasCompare) {
    return '未配置对照源，仅输出润色结果'
  }
  return undefined
}

function findServiceIdByModeLabel(
  serviceModeLabels: Record<string, string>,
  label: string
): string | undefined {
  return Object.entries(serviceModeLabels).find(([, modeLabel]) => modeLabel === label)?.[0]
}

const MODE_LABEL: Record<string, string> = {
  [TranslateModeEnum.POLISH]: '润色',
  [TranslateModeEnum.COMPARE]: '对照',
  [TranslateModeEnum.TRANSLATE]: '翻译'
}

export function isDualPolishCompareModes(modes: string[]): boolean {
  return modes.includes(TranslateModeEnum.POLISH) && modes.includes(TranslateModeEnum.COMPARE)
}

function buildRequestInfo(
  translateContent: string,
  languageType: string,
  languageResultType: string,
  translateMode: string,
  customRolePrompt: string,
  useProxy: string
): TranslateRequestPayload {
  return {
    channel: 0,
    translateContent,
    languageType,
    languageResultType,
    translateMode,
    customRolePrompt,
    useProxy
  }
}

/**
 * 构建翻译执行计划（支持单模式或润色+对照双模式）
 */
export function buildTranslateExecutionPlan(
  translateContentDealWith: string,
  modes: string[]
): TranslateExecutionPlan {
  const requestMap = new Map<string, TranslateRequestPayload>()
  const activeServiceIds: string[] = []
  const serviceModeLabels: Record<string, string> = {}
  const usedServiceIds = new Set<string>()
  const modesFulfilled: string[] = []
  let bindingFallback: BindingFallback | undefined

  for (const translateMode of modes) {
    const { services, bindingFallback: fallback } = resolveActiveServicesForMode(translateMode)
    if (!bindingFallback && fallback) {
      bindingFallback = fallback
    }
    if (services.length === 0) {
      continue
    }

    const { inputLanguage, resultLanguage } = resolveLanguagesForTranslate(
      translateContentDealWith,
      translateMode
    )
    const customRolePrompt = getCustomRolePrompt(translateMode)
    let modeFulfilled = false

    for (const translateService of services) {
      if (usedServiceIds.has(translateService.id)) {
        continue
      }
      const type = translateService.type
      if (requestMap.has(type)) {
        continue
      }

      const langTypes = resolveLanguageTypesForService(
        type,
        translateMode,
        inputLanguage,
        resultLanguage
      )
      if (isNull(langTypes)) {
        continue
      }

      usedServiceIds.add(translateService.id)
      activeServiceIds.push(translateService.id)
      serviceModeLabels[translateService.id] = MODE_LABEL[translateMode] ?? translateMode
      modeFulfilled = true

      let info = buildRequestInfo(
        translateContentDealWith,
        langTypes.languageInputType,
        langTypes.languageResultType,
        translateMode,
        isAiTranslateService(type) ? customRolePrompt : '',
        translateService.useProxy ?? YesNoEnum.N
      )
      info = {
        ...info,
        id: translateService.id,
        appId: translateService.appId,
        appKey: translateService.appKey
      }
      const defaultInfo = TranslateServiceBuilder.getServiceConfigInfo(type).defaultInfo
      if (isNotNull(defaultInfo)) {
        Object.keys(defaultInfo).forEach((key) => {
          info[key] = translateService[key]
        })
      }
      requestMap.set(type, info)
    }

    if (modeFulfilled) {
      modesFulfilled.push(translateMode)
    }
  }

  const polishServiceId = findServiceIdByModeLabel(
    serviceModeLabels,
    MODE_LABEL[TranslateModeEnum.POLISH]
  )
  const compareServiceId = findServiceIdByModeLabel(
    serviceModeLabels,
    MODE_LABEL[TranslateModeEnum.COMPARE]
  )
  const partialDualMessage = buildPartialDualMessage(modes, modesFulfilled)

  if (activeServiceIds.length === 0) {
    return {
      requestMap,
      activeServiceIds,
      serviceModeLabels,
      modesFulfilled,
      polishServiceId,
      compareServiceId,
      partialDualMessage,
      bindingFallback,
      translateRecordVo: null,
      emptyMessage: getEmptyModeMessage(modes[0])
    }
  }

  const { inputLanguage, resultLanguage } = resolveLanguagesForTranslate(
    translateContentDealWith,
    modes[0]
  )
  const translateRecordVo = TranslateRecordVo.build({
    translateContentDealWith,
    inputLanguage,
    resultLanguage
  })

  requestMap.forEach((info) => {
    info.requestId = translateRecordVo.requestId
  })

  return {
    requestMap,
    activeServiceIds,
    serviceModeLabels,
    modesFulfilled,
    polishServiceId,
    compareServiceId,
    partialDualMessage,
    bindingFallback,
    translateRecordVo
  }
}

export function notifyBindingFallbackIfNeeded(fallback: BindingFallback | undefined): void {
  if (fallback && shouldNotifyBindingFallback(fallback)) {
    ElMessageExtend.warning(fallback.message)
  }
}
