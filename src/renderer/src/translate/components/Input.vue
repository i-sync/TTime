<template>
  <div class="content-block">
    <div class="content">
      <div class="content-input-block">
        <div v-show="isScreenshotEnd" class="content-input-placeholder">
          <span class="content-input-screenshot-text">文字识别中</span>
          <img class="content-input-screenshot-loading" :src="loadingImageSrc" />
        </div>
        <el-input
          v-show="!isScreenshotEnd"
          ref="translateContentInputRef"
          v-model="translateContent"
          class="content-input"
          spellcheck="false"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 10 }"
          placeholder="请输入单词或文字"
          @input="translateContentInputEvent"
          @keydown="translateChange"
          @focus="translateContentFocus"
        >
        </el-input>
        <div class="function-tools-block">
          <a v-show="!isScreenshotEnd" class="function-tools" @click="playSpeech(translateContent)">
            <svg-icon icon-class="play" class="function-tools-icon" />
          </a>
          <a
            v-show="!isScreenshotEnd"
            class="function-tools"
            @click="textWriteShearPlate(translateContent)"
          >
            <svg-icon icon-class="copy" class="function-tools-icon" />
          </a>
          <a v-show="isScreenshotEnd" class="function-tools" @click="screenshotRestore">
            <svg-icon icon-class="restore" class="function-tools-icon" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { isNull } from '../../../../common/utils/validate'

import loadingImage from '../../assets/loading.gif'
import translate from '../../utils/translate'
import { cacheGet, cacheGetByType, cacheSet } from '../../utils/cacheUtil'
import ElMessageExtend from '../../utils/messageExtend'
import { YesNoEnum } from '../../../../common/enums/YesNoEnum'
import TranslateServiceRecordVo from '../../../../common/class/TranslateServiceRecordVo'
import { StoreTypeEnum } from '../../../../common/enums/StoreTypeEnum'
import { updateTranslateRecordList } from '../../utils/translateRecordUtil'
import TranslateModeEnum from '../../../../common/enums/TranslateModeEnum'
import { TranslateContentSourceEnum } from '../../../../common/enums/TranslateContentSourceEnum'
import { getTranslateMode } from '../../utils/translateModeUtil'
import { applyModeForExternalContent } from '../../utils/translateExternalEntryUtil'
import {
  buildTranslateExecutionPlan,
  isDualPolishCompareModes,
  notifyBindingFallbackIfNeeded
} from '../../utils/translateExecutionUtil'
import {
  clearRoundTripHintPending,
  markCompareTranslatePending
} from '../../utils/translateRoundTripHintUtil'

// 加载loading
const loadingImageSrc = ref(loadingImage)
// 是否触发屏幕截图
const isScreenshotEnd = ref(false)
// 翻译输入框内容
const translateContent = ref('')
// 翻译输入框ref
const translateContentInputRef = ref()
const emit = defineEmits([
  'show-result-event',
  'is-result-loading-event',
  'active-services-changed',
  'service-mode-labels-changed',
  'external-entry-mode-changed'
])

watch(translateContent, () => {
  // 页面高度改变监听
  window.api.windowHeightChangeMaxEvent()
  // 当翻译内容被改变时则直接关闭截图翻译状态
  // 屏幕截图识别中状态重置
  screenshotRestore()
})

// 截图翻译结束事件
window.api.screenshotEndNotifyEvent(() => {
  isScreenshotEnd.value = true
})

// 监听更新翻译输入内容事件
window.api.updateTranslateContentEvent((content, source) => {
  const entrySource = source ?? TranslateContentSourceEnum.DEFAULT
  const { modeChanged } = applyModeForExternalContent(content, entrySource)
  translateContent.value = content
  if (modeChanged) {
    emit('external-entry-mode-changed')
  }
  translateFun()
})

/**
 * 翻译内容获取焦点事件
 */
const translateContentFocus = (): void => {
  // 当获取焦点时触发 窗口高度更改最大事件
  window.api.windowHeightChangeMaxEvent()
}

// 窗口显示事件 当窗口显示时触发
window.api.winShowEvent(() => {
  nextTick(() => {
    translateContentInputRef.value.focus()
  })
})

/**
 * 屏幕截图识别中状态重置
 */
const screenshotRestore = (): void => {
  isScreenshotEnd.value = false
}

/**
 * 播放语音
 *
 * @param text 播放的文字
 */
const playSpeech = (text): void => {
  translate.playSpeech(text)
}

/**
 * 文字写入到剪贴板
 */
const textWriteShearPlate = (text): void => {
  translate.textWriteShearPlate(text)
}

/**
 * 翻译触发
 */
const translateChange = async (event): Promise<void> => {
  // console.log('event =', event)
  // 按下 ctrl/command + 回车 = 换行
  if (event.keyCode === 13 && (event.ctrlKey || event.metaKey)) {
    // 换行
    translateContent.value += '\n'
    return
  }

  const inputTranslationAutoStatus = cacheGet('inputTranslationAutoStatus')

  // 文本粘贴快捷键
  const isCtrlV =
    (event.ctrlKey || event.metaKey) &&
    event.keyCode === 86 &&
    inputTranslationAutoStatus === YesNoEnum.N

  // keyCode 13 = 回车
  if (event.keyCode !== 13 && !isCtrlV) {
    return
  }

  // 如果开启了输入自动翻译模式 则回车翻译功能关闭
  if (event.keyCode === 13 && inputTranslationAutoStatus === YesNoEnum.Y) {
    event.preventDefault()
    return
  }

  // 延时100毫秒
  if (isCtrlV) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  if (isContentNull(translateContent.value)) {
    ElMessageExtend.warning('内容不能为空')
    event.preventDefault()
    return
  }
  translateFun()
  // 阻止浏览器默认换行操作
  event.preventDefault()
}

const prepareTranslateContent = (): string | null => {
  let translateContentDealWith = translateContent.value
  window.api.logInfoEvent('[翻译事件] - 翻译内容 : ', translateContentDealWith)
  if (isContentNull(translateContentDealWith)) {
    window.api.logInfoEvent('[翻译事件] - 翻译内容过滤后为空')
    translateContent.value = ''
    screenshotRestore()
    ElMessageExtend.warning('识别内容为空')
    return null
  }
  if (cacheGet('wrapReplaceSpaceStatus') === YesNoEnum.Y) {
    translateContentDealWith = translateContentDealWith.replaceAll('\n', ' ').replaceAll('\r', ' ')
  }
  return translateContentDealWith
}

const runTranslatePlan = (modes: string[]): void => {
  const dualOutput = isDualPolishCompareModes(modes)
  emit('show-result-event', false)
  clearRoundTripHintPending()
  const translateContentDealWith = prepareTranslateContent()
  if (!translateContentDealWith) {
    return
  }

  const plan = buildTranslateExecutionPlan(translateContentDealWith, modes)
  notifyBindingFallbackIfNeeded(plan.bindingFallback)

  cacheSet('lastActiveServiceIds', plan.activeServiceIds)
  const serviceModeLabels = dualOutput ? plan.serviceModeLabels : {}
  cacheSet('activeServiceModeLabels', serviceModeLabels)
  if (dualOutput) {
    cacheSet('dualOutputActive', YesNoEnum.Y)
    cacheSet('dualOutputPolishServiceId', plan.polishServiceId ?? '')
    cacheSet('dualOutputCompareServiceId', plan.compareServiceId ?? '')
  } else {
    cacheSet('dualOutputActive', YesNoEnum.N)
    cacheSet('dualOutputPolishServiceId', '')
    cacheSet('dualOutputCompareServiceId', '')
  }
  emit('service-mode-labels-changed', serviceModeLabels)
  emit('active-services-changed', plan.activeServiceIds)

  if (plan.partialDualMessage) {
    ElMessageExtend.warning(plan.partialDualMessage)
  }

  if (plan.emptyMessage) {
    ElMessageExtend.warning(plan.emptyMessage)
    emit('is-result-loading-event', false)
    return
  }

  if (plan.requests.length === 0) {
    ElMessageExtend.warning('当前语言对不受已启用翻译源支持，请检查语言设置')
    emit('is-result-loading-event', false)
    return
  }

  if (modes.includes(TranslateModeEnum.COMPARE)) {
    markCompareTranslatePending()
  }

  emit('is-result-loading-event', true)
  window.api.ttimeApiTranslateUse()

  if (plan.translateRecordVo) {
    cacheSet('activeTranslateRequestId', plan.translateRecordVo.requestId)
  } else {
    cacheSet('activeTranslateRequestId', '')
  }

  const translateHistoryStatus = cacheGet('translateHistoryStatus') === YesNoEnum.Y
  if (translateHistoryStatus && plan.translateRecordVo) {
    const translateServiceRecordList = []
    plan.requests.forEach((request) => {
      const serviceRecordVo = new TranslateServiceRecordVo()
      serviceRecordVo.translateServiceType = request.serviceType
      serviceRecordVo.translateServiceId = request.serviceId
      serviceRecordVo.translateStatus = false
      translateServiceRecordList.push(serviceRecordVo)
    })
    plan.translateRecordVo.translateServiceRecordList = translateServiceRecordList
    let translateRecordList = cacheGetByType(StoreTypeEnum.HISTORY_RECORD, 'translateRecordList')
    translateRecordList = isNull(translateRecordList) ? [] : translateRecordList
    translateRecordList.push(plan.translateRecordVo)
    updateTranslateRecordList(translateRecordList)
  }

  plan.requests.forEach((request) => {
    window.api.apiUniteTranslate(request.serviceType, request.payload)
  })
}

/**
 * 翻译（当前模式）
 */
const translateFun = (): void => {
  runTranslatePlan([getTranslateMode()])
}

/**
 * 一键润色 + 对照双输出
 */
const translateDualPolishCompareFun = (): void => {
  runTranslatePlan([TranslateModeEnum.POLISH, TranslateModeEnum.COMPARE])
}

/**
 * 是否内容为空
 *
 * @param content 内容
 */
const isContentNull = (content): boolean => {
  return isNull(content.replaceAll('\n', '').replaceAll('\r', '').replaceAll(' ', ''))
}

// 翻译内容输入事件 - 任务
let translateContentInputTimeout

/**
 * 翻译内容输入事件
 */
const translateContentInputEvent = (): void => {
  if (cacheGet('inputTranslationAutoStatus') === YesNoEnum.Y) {
    clearTimeout(translateContentInputTimeout)
    // 防抖时间为500毫秒
    translateContentInputTimeout = setTimeout(() => {
      if (isContentNull(translateContent.value)) {
        return
      }
      translateFun()
    }, 500)
  }
}

/**
 * 获取翻译内容
 */
const getTranslateContent = (): string => {
  return translateContent.value
}

/**
 * 设置翻译内容
 *
 * @param value 翻译内容
 */
const setTranslateContent = (value): void => {
  translateContent.value = value
}

/**
 * 清除翻译内容事件
 */
const clearTranslatedContentEvent = (): void => {
  setTranslateContent('')
}

defineExpose({
  getTranslateContent,
  setTranslateContent,
  clearTranslatedContentEvent,
  translateFun,
  translateDualPolishCompareFun
})

window.api.winFontSizeNotify(() => {
  document.documentElement.style.setProperty('--input-text-size', cacheGet('winFontSize') + 'px')
})

document.documentElement.style.setProperty('--input-text-size', cacheGet('winFontSize') + 'px')
</script>

<style lang="scss" scoped>
@import '../../css/translate.scss';
@import '../../css/translate-input.scss';

.content-input-placeholder {
  display: flex;
  height: 52px;
  padding: 10px 10px 1px 10px;

  .content-input-screenshot-loading {
    height: 16px;
  }

  .content-input-screenshot-text {
    font-size: 12px;
    color: $input-loading-text-color;
    margin-right: 10px;
  }
}
</style>
