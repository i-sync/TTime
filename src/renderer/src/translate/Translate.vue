<template>
  <div class="block">
    <Header />
    <div class="block-layer">
      <translate-mode-select
        v-show="!hideTranslateLanguage"
        ref="translateModeSelectRef"
        @mode-changed="onModeChanged"
      />

      <language-select
        v-show="!hideTranslateLanguage"
        ref="languageSelectRef"
        @swap-symmetric="onSwapSymmetric"
        @polish-to-verify="onPolishToVerify"
      />

      <Input
        v-show="!hideTranslateInput"
        ref="translateInput"
        @show-result-event="(value) => translatedResultInput.setShowResult(value)"
        @is-result-loading-event="(value) => translatedResultInput.setIsResultLoading(value)"
        @active-services-changed="onActiveServicesChanged"
      />

      <div v-show="!hideTranslateLanguage" class="result-actions-block">
        <a class="result-action function-tools" @click="onReplaceInputWithResult">
          <svg-icon icon-class="substitution" class="function-tools-icon result-action-icon" />
          <span class="result-action-text">用结果替换输入</span>
        </a>
      </div>

      <input-result-content ref="translatedResultInput" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Header from './components/Header.vue'
import Input from './components/Input.vue'
import LanguageSelect from './components/LanguageSelect.vue'
import TranslateModeSelect from './components/TranslateModeSelect.vue'
import InputResultContent from './components/InputResultContent.vue'

import { nextTick, ref } from 'vue'
import ElMessageExtend from '../utils/messageExtend'

import { isNull } from '../../../common/utils/validate'
import { buildTranslateService, setTranslateServiceMap } from '../utils/translateServiceUtil'
import { buildOcrService, setOcrServiceMap } from '../utils/ocrServiceUtil'
import { initTheme } from '../utils/themeUtil'
import { cacheGet, oldCacheGet } from '../utils/cacheUtil'
import '../channel/ChannelRequest'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'
import OcrServiceEnum from '../../../common/enums/OcrServiceEnum'
import { loadNewServiceInfo } from '../utils/memberUtil'
import { YesNoEnum } from '../../../common/enums/YesNoEnum'
import { getActiveServicesForMode, initTranslateMode } from '../utils/translateModeUtil'
import { useTranslateWorkflow } from './composables/useTranslateWorkflow'

initTheme()
initTranslateMode()

const translateInput = ref()
const translatedResultInput = ref()
const languageSelectRef = ref()
const translateModeSelectRef = ref()
const hideTranslateInput = ref(false)
const hideTranslateLanguage = ref(false)

const onModeChanged = (): void => {
  languageSelectRef.value?.syncFromCache()
  translateModeSelectRef.value?.refreshMode()
  const activeIds = getActiveServicesForMode().map((service) => service.id)
  translatedResultInput.value?.setActiveServiceIds(activeIds)
}

const { onSwapSymmetric, onPolishToVerify, onReplaceInputWithResult } = useTranslateWorkflow({
  getInput: () => translateInput.value,
  getResult: () => translatedResultInput.value,
  getLanguageSelect: () => languageSelectRef.value,
  onModeSync: onModeChanged
})

window.api.ttimeApiAppStart()
window.api.pageHeightChangeEvent()
loadNewServiceInfo()

window.api.clearAllTranslateContentEvent(() => {
  translatedResultInput.value?.clearTranslatedResultContentEvent()
  translateInput.value?.clearTranslatedContentEvent()
})

window.api.winShowByInputEvent(() => {
  nextTick(() => {
    window.api.windowHeightChangeEvent()
    hideTranslateInput.value = cacheGet('hideTranslateInput') === YesNoEnum.Y
    hideTranslateLanguage.value = cacheGet('hideTranslateLanguage') === YesNoEnum.Y
  })
})

const onActiveServicesChanged = (ids: string[]): void => {
  translatedResultInput.value?.setActiveServiceIds(ids, true)
}

if (isNull(cacheGet('translateServiceMap'))) {
  const translateServiceMap = oldCacheGet('translateServiceMap')
  if (undefined !== translateServiceMap) {
    setTranslateServiceMap(new Map(translateServiceMap))
  } else {
    const map = new Map()
    const ttimeService = buildTranslateService(TranslateServiceEnum.TTIME)
    map.set(ttimeService.id, ttimeService)
    setTranslateServiceMap(map)

    const bingDictService = buildTranslateService(TranslateServiceEnum.BING_DICT)
    map.set(bingDictService.id, bingDictService)
    setTranslateServiceMap(map)

    const deepLBuiltInService = buildTranslateService(TranslateServiceEnum.DEEP_L_BUILT_IN)
    map.set(deepLBuiltInService.id, deepLBuiltInService)
    setTranslateServiceMap(map)

    const niuTransBuiltInService = buildTranslateService(TranslateServiceEnum.NIU_TRANS_BUILT_IN)
    map.set(niuTransBuiltInService.id, niuTransBuiltInService)
    setTranslateServiceMap(map)
  }
}

if (isNull(cacheGet('ocrServiceMap'))) {
  const ocrServiceMap = oldCacheGet('ocrServiceMap')
  if (undefined !== ocrServiceMap) {
    setOcrServiceMap(new Map(ocrServiceMap))
  } else {
    const map = new Map()
    const ttimeService = buildOcrService(OcrServiceEnum.TTIME)
    map.set(ttimeService.id, ttimeService)
    setOcrServiceMap(map)
  }
}

window.api.showMsgEvent((type, msg) => {
  if (type === ElMessageExtend.SUCCESS) {
    ElMessageExtend.success(msg)
  } else if (type === ElMessageExtend.WARNING) {
    ElMessageExtend.warning(msg)
  } else if (type === ElMessageExtend.ERROR) {
    ElMessageExtend.errorInOptions(msg, { duration: 5 * 1000 })
  }
})
</script>

<style lang="scss" scoped>
@import '../css/translate.scss';
@import '../css/translate-input.scss';

.block {
  margin-left: 10px;
  margin-right: 10px;
  border-radius: 8px;
  background-color: var(--ttime-translate-color-background);
  box-shadow: 1px 1px 4px -1px var(--ttime-box-shadow-color);
  border: solid 1px var(--ttime-translate-border-color);
}

.block-layer {
  overflow: auto;
  max-height: 671px;
  overflow-x: hidden;
}

.block-layer::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.block-layer::-webkit-scrollbar-thumb {
  border-radius: 3px;
  -moz-border-radius: 3px;
  -webkit-border-radius: 3px;
  background-color: #c3c3c3;
}

.block-layer::-webkit-scrollbar-track {
  background-color: transparent;
}

.result-actions-block {
  display: flex;
  justify-content: flex-end;
  margin: 0 12px 8px 12px;

  .result-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 12px;
    color: var(--ttime-text-color);
    background: var(--ttime-translate-input-color-background);
  }

  .result-action-icon {
    width: 14px;
    height: 14px;
  }

  .result-action-text {
    line-height: 1;
  }
}
</style>
