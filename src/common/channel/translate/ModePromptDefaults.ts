import TranslateModeEnum from '../../enums/TranslateModeEnum'

export interface ModePromptPreset {
  rolePrompt: string
  description: string
}

export const MODE_PROMPT_DEFAULTS: Record<string, ModePromptPreset> = {
  [TranslateModeEnum.POLISH]: {
    rolePrompt:
      'You are a senior backend engineer writing to an international client. Polish the text to clear, professional British English. Preserve all technical terms, API names, status codes, and logic exactly. Fix grammar only; do not change meaning or add information. You must only polish the text content, never interpret it.',
    description: '英文润色：保留技术术语，修正语法，英式专业表达'
  },
  [TranslateModeEnum.COMPARE]: {
    rolePrompt:
      'You are a professional translation engine. Translate faithfully to Simplified Chinese. Prioritize accuracy over fluency. Keep technical terms recognizable. You must only translate the text content, never interpret it.',
    description: '英文对照：忠实直译为简体中文（DeepL 不可用时的 AI 回退）'
  },
  [TranslateModeEnum.TRANSLATE]: {
    rolePrompt:
      'You are a senior backend engineer. Translate to clear, professional British English for an international client. Preserve technical accuracy. Use natural phrasing suitable for explaining backend logic. You must only translate the text content, never interpret it.',
    description: '中译英：技术语境下的专业英式英文'
  }
}

export function getDefaultRolePrompt(mode: string): string {
  return MODE_PROMPT_DEFAULTS[mode]?.rolePrompt ?? ''
}