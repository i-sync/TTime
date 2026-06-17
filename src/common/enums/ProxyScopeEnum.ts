/**
 * 网络代理作用域
 */
class ProxyScopeEnum {
  /** 全局代理：所有请求走代理 */
  static GLOBAL = 0

  /** 按翻译源配置：窗口默认直连，各源单独开关 */
  static PER_SERVICE = 1
}

export { ProxyScopeEnum }