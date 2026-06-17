/**
 * 翻译模式枚举
 */
class TranslateModeEnum {
  /** 英文润色 EN→EN */
  static POLISH = '润色'

  /** 英文对照翻译 EN→CN */
  static COMPARE = '对照'

  /** 中译英 CN→EN */
  static TRANSLATE = '翻译'

  static ALL = [TranslateModeEnum.POLISH, TranslateModeEnum.COMPARE, TranslateModeEnum.TRANSLATE]

  static DEFAULT = TranslateModeEnum.COMPARE
}

export default TranslateModeEnum