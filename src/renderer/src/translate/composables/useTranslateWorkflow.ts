import ElMessageExtend from '../../utils/messageExtend'
import { cacheGet, cacheSet } from '../../utils/cacheUtil'
import TranslateModeEnum from '../../../../common/enums/TranslateModeEnum'
import { resolveAndPersistAutoLanguage, setTranslateMode } from '../../utils/translateModeUtil'
import type { TranslateWorkflowDeps } from '../types/TranslateWorkflowTypes'

export function useTranslateWorkflow(deps: TranslateWorkflowDeps): {
  onSwapSymmetric: () => void
  onPolishToVerify: () => void
  onReplaceInputWithResult: () => void
} {
  const onSwapSymmetric = (): void => {
    const inputRef = deps.getInput()
    const resultRef = deps.getResult()
    if (!inputRef || !resultRef) {
      return
    }

    resolveAndPersistAutoLanguage(inputRef.getTranslateContent())
    deps.getLanguageSelect()?.syncFromCache()

    const inputLanguage = cacheGet('inputLanguage')
    const resultLanguage = cacheGet('resultLanguage')
    cacheSet('inputLanguage', resultLanguage)
    cacheSet('resultLanguage', inputLanguage)
    deps.getLanguageSelect()?.syncFromCache()

    const primaryContent = resultRef.getPrimaryResultContent()
    if (!primaryContent) {
      ElMessageExtend.warning('翻译结果为空，请先完成翻译')
      return
    }

    const temp = inputRef.getTranslateContent()
    inputRef.setTranslateContent(primaryContent)
    resultRef.setPrimaryResultContent(temp)
    inputRef.translateFun()
  }

  const onPolishToVerify = (): void => {
    const inputRef = deps.getInput()
    const resultRef = deps.getResult()
    if (!inputRef || !resultRef) {
      return
    }

    const content = resultRef.getPrimaryResultContent()
    if (!content) {
      ElMessageExtend.warning('润色结果为空，请先完成润色')
      return
    }

    inputRef.setTranslateContent(content)
    setTranslateMode(TranslateModeEnum.COMPARE)
    deps.onModeSync()
    inputRef.translateFun()
  }

  const onReplaceInputWithResult = (): void => {
    const inputRef = deps.getInput()
    const resultRef = deps.getResult()
    if (!inputRef || !resultRef) {
      return
    }

    const content = resultRef.getPrimaryResultContent()
    if (!content) {
      ElMessageExtend.warning('当前无可用翻译结果')
      return
    }

    inputRef.setTranslateContent(content)
    resultRef.setPrimaryResultContent('')
  }

  return {
    onSwapSymmetric,
    onPolishToVerify,
    onReplaceInputWithResult
  }
}
