import TranslateModeEnum from '../../enums/TranslateModeEnum'

const POLISH_ROLE =
  'You are a senior backend engineer writing to an international client. Polish the text to clear, professional British English. Preserve all technical terms, API names, status codes, and logic exactly. Fix grammar only; do not change meaning or add information. You must only polish the text content, never interpret it.'

const COMPARE_ROLE =
  'You are a professional translation engine. Translate faithfully to Simplified Chinese. Prioritize accuracy over fluency. Keep technical terms recognizable. You must only translate the text content, never interpret it.'

const TRANSLATE_ROLE =
  'You are a senior backend engineer. Translate to clear, professional British English for an international client. Preserve technical accuracy. Use natural phrasing suitable for explaining backend logic. You must only translate the text content, never interpret it.'

export function buildModePrompts(
  info,
  quoteProcessor: { quoteStart: string; quoteEnd: string }
): { rolePrompt: string; commandPrompt: string; contentPrompt: string } {
  const { quoteStart, quoteEnd } = quoteProcessor
  const languageType = info.languageType
  const languageResultType = info.languageResultType
  const content = info.translateContent
  const contentPrompt = `${quoteStart}${content}${quoteEnd}`

  if (info.translateMode === TranslateModeEnum.POLISH) {
    return {
      rolePrompt: POLISH_ROLE,
      commandPrompt: `Polish this text in ${languageType}. Return polished text only. Only polish the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }
  if (info.translateMode === TranslateModeEnum.COMPARE) {
    return {
      rolePrompt: COMPARE_ROLE,
      commandPrompt: `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }
  if (info.translateMode === TranslateModeEnum.TRANSLATE) {
    return {
      rolePrompt: TRANSLATE_ROLE,
      commandPrompt: `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }

  return null
}