<template>
  <div v-for="translateService in allServices" :key="translateService.id">
    <input-result-content-channel
      v-show="isServiceVisible(translateService.id)"
      :ref="setChannelRef(translateService.id)"
      :translate-service="translateService"
      :mode-label="serviceModeLabels[translateService.id] ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import InputResultContentChannel from './channel/InputResultContentChannel.vue'

import { computed, ref } from 'vue'
import { getTranslateServiceMapByUse } from '../../utils/translateServiceUtil'
import {
  getActiveServicesForMode,
  getPrimaryServiceForMode,
  getTranslateMode
} from '../../utils/translateModeUtil'
import { cacheGet } from '../../utils/cacheUtil'
import { YesNoEnum } from '../../../../common/enums/YesNoEnum'
import TranslateModeEnum from '../../../../common/enums/TranslateModeEnum'
import type { TranslateResultChannelApi } from '../types/TranslateResultChannelTypes'

const channelRefMap = ref(new Map<string, TranslateResultChannelApi>())
const activeServiceIds = ref<string[]>(getActiveServicesForMode().map((service) => service.id))
const serviceModeLabels = ref<Record<string, string>>({})

const allServices = computed(() => [...getTranslateServiceMapByUse().values()])

const isServiceVisible = (serviceId: string): boolean => {
  if (activeServiceIds.value.length === 0) {
    return false
  }
  return activeServiceIds.value.includes(serviceId)
}

/**
 * 加载翻译服务
 */
const initTranslateServiceMap = (): void => {
  channelRefMap.value = new Map()
  const cachedIds = cacheGet('lastActiveServiceIds')
  if (Array.isArray(cachedIds) && cachedIds.length > 0) {
    activeServiceIds.value = cachedIds
  } else {
    activeServiceIds.value = getActiveServicesForMode().map((service) => service.id)
  }
  const cachedLabels = cacheGet('activeServiceModeLabels')
  serviceModeLabels.value = cachedLabels && typeof cachedLabels === 'object' ? cachedLabels : {}
}

initTranslateServiceMap()

/**
 * 更新翻译服务事件
 */
window.api.updateTranslateServiceEvent(() => {
  initTranslateServiceMap()
})

/**
 * 设置通道 ref（按 serviceId 索引）
 */
const setChannelRef = (serviceId: string): ((el: TranslateResultChannelApi | null) => void) => {
  return (el: TranslateResultChannelApi | null): void => {
    if (el) {
      channelRefMap.value.set(serviceId, el)
    } else {
      channelRefMap.value.delete(serviceId)
    }
  }
}

const getChannelByServiceId = (serviceId: string): TranslateResultChannelApi | undefined => {
  return channelRefMap.value.get(serviceId)
}

const forEachVisibleChannel = (fn: (channel: TranslateResultChannelApi) => void): void => {
  channelRefMap.value.forEach((channel, serviceId) => {
    if (isServiceVisible(serviceId)) {
      fn(channel)
    }
  })
}

const resolveDualOutputServiceId = (): string | undefined => {
  if (cacheGet('dualOutputActive') !== YesNoEnum.Y) {
    return undefined
  }
  const polishId = cacheGet('dualOutputPolishServiceId')
  const compareId = cacheGet('dualOutputCompareServiceId')
  if (getTranslateMode() === TranslateModeEnum.COMPARE) {
    return compareId || undefined
  }
  return polishId || undefined
}

const resolvePrimaryServiceId = (): string | undefined => {
  const dualServiceId = resolveDualOutputServiceId()
  if (dualServiceId) {
    return dualServiceId
  }
  return getPrimaryServiceForMode()?.id
}

/**
 * 获取主结果源内容
 */
const getPrimaryResultContent = (): string => {
  const serviceId = resolvePrimaryServiceId()
  if (!serviceId) {
    return ''
  }
  return getChannelByServiceId(serviceId)?.getTranslatedResultContent() ?? ''
}

/**
 * 设置主结果源内容
 */
const setPrimaryResultContent = (value: string): void => {
  const serviceId = resolvePrimaryServiceId()
  if (!serviceId) {
    return
  }
  getChannelByServiceId(serviceId)?.setTranslatedResultContent(value)
}

/**
 * 当前模式下参与翻译的源变更
 *
 * @param ids 活跃源 id 列表
 * @param clearInactive 翻译触发时清除非活跃源结果；模式切换时保留
 */
const setServiceModeLabels = (labels: Record<string, string>): void => {
  serviceModeLabels.value = labels ?? {}
}

const setActiveServiceIds = (ids: string[], clearInactive = false): void => {
  if (clearInactive) {
    const previousIds = new Set(activeServiceIds.value)
    const nextIds = new Set(ids)
    previousIds.forEach((id) => {
      if (!nextIds.has(id)) {
        getChannelByServiceId(id)?.clearTranslatedResultContentEvent()
      }
    })
  }
  activeServiceIds.value = ids
}

/**
 * 设置翻译内容
 */
const setTranslatedResultContent = (value: string): void => {
  channelRefMap.value.forEach((channel) => {
    channel.setTranslatedResultContent(value)
  })
}

/**
 * 设置显示翻译结果状态（仅当前可见源）
 */
const setShowResult = (value: boolean): void => {
  forEachVisibleChannel((channel) => {
    channel.setShowResult(value)
  })
}

/**
 * 设置显示翻译加载中状态（仅当前可见源）
 */
const setIsResultLoading = (value: boolean): void => {
  forEachVisibleChannel((channel) => {
    channel.setIsResultLoading(value)
  })
}

/**
 * 清空翻译结果内容事件
 */
const clearTranslatedResultContentEvent = (): void => {
  channelRefMap.value.forEach((channel) => {
    channel.clearTranslatedResultContentEvent()
  })
}

defineExpose({
  getPrimaryResultContent,
  setPrimaryResultContent,
  getChannelByServiceId,
  setActiveServiceIds,
  setServiceModeLabels,
  setTranslatedResultContent,
  clearTranslatedResultContentEvent,
  setShowResult,
  setIsResultLoading
})
</script>

<style lang="scss" scoped></style>
