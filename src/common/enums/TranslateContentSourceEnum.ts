/**
 * 外部写入翻译输入内容的来源
 */
class TranslateContentSourceEnum {
  /** 划词翻译快捷键 */
  static CHOICE = 'choice'

  /** 剪贴板 Ctrl+C 监听 */
  static CLIPBOARD = 'clipboard'

  /** 其他（截图翻译、悬浮球等） */
  static DEFAULT = 'default'
}

export { TranslateContentSourceEnum }
