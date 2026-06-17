import { YesNoEnum } from '../../../common/enums/YesNoEnum'
import TranslateModeEnum from '../../../common/enums/TranslateModeEnum'
import { cacheGet } from './cacheUtil'
import ElMessageExtend from './messageExtend'

let pendingCompareHint = false

export function isRoundTripHintEnabled(): boolean {
  return cacheGet('roundTripHintStatus') !== YesNoEnum.N
}

export function markCompareTranslatePending(): void {
  if (!isRoundTripHintEnabled()) {
    return
  }
  pendingCompareHint = true
}

export function tryShowRoundTripHint(translateMode: string | undefined): void {
  if (!isRoundTripHintEnabled()) {
    return
  }
  if (translateMode !== TranslateModeEnum.COMPARE) {
    return
  }
  if (!pendingCompareHint) {
    return
  }
  pendingCompareHint = false
  ElMessageExtend.success('对照完成。点击语言栏 ⇄ 可将中文结果反译为英文，检查 round-trip 是否一致')
}

export function clearRoundTripHintPending(): void {
  pendingCompareHint = false
}
