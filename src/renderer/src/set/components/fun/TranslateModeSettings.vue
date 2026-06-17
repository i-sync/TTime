<template>
  <div class="translate-mode-settings">
    <span class="group-title-span none-select">翻译模式 Prompt</span>
    <el-divider />
    <p class="settings-hint none-select">
      覆盖各模式的 System Prompt（仅 OpenAI / AzureOpenAI）。留空则使用内置预设。
    </p>

    <el-form label-width="80px" label-position="left">
      <el-form-item v-for="mode in modes" :key="mode" :label="mode">
        <el-input
          v-model="customPrompts[mode].rolePrompt"
          type="textarea"
          :rows="3"
          spellcheck="false"
          :placeholder="defaultPrompts[mode]"
          @change="() => savePrompts(false)"
        />
        <div class="prompt-actions">
          <el-button size="small" plain @click="resetPrompt(mode)">恢复默认</el-button>
        </div>
      </el-form-item>
      <el-form-item>
        <el-button plain @click="() => savePrompts(true)">保存 Prompt</el-button>
      </el-form-item>
    </el-form>

    <span class="group-title-span none-select">模式与翻译源绑定</span>
    <el-divider />
    <p class="settings-hint none-select">
      为每种模式指定固定翻译源，将覆盖默认路由优先级。选择「自动」则按内置优先级选择。
    </p>

    <el-form label-width="80px" label-position="left">
      <el-form-item v-for="mode in modes" :key="'bind-' + mode" :label="mode">
        <el-select
          v-model="serviceBindings[mode]"
          size="small"
          clearable
          placeholder="自动（按优先级）"
          @change="(val) => onBindingChange(mode, val)"
        >
          <el-option label="自动（按优先级）" value="" />
          <el-option
            v-for="service in getBindableServicesForMode(mode)"
            :key="service.id"
            :label="service.serviceName"
            :value="service.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import TranslateModeEnum from '../../../../../common/enums/TranslateModeEnum'
import { MODE_PROMPT_DEFAULTS } from '../../../../../common/channel/translate/ModePromptDefaults'
import {
  type CustomModePrompts,
  getCustomModePrompts,
  getModeServiceBindings,
  setCustomModePrompts,
  setModeServiceBinding,
  resetCustomRolePrompt
} from '../../../utils/translateModeConfigUtil'
import {
  clearBindingFallbackWarnCache,
  getBindableServicesForMode
} from '../../../utils/translateModeUtil'
import ElMessageExtend from '../../../utils/messageExtend'

const modes = TranslateModeEnum.ALL
const defaultPrompts = Object.fromEntries(
  modes.map((mode) => [mode, MODE_PROMPT_DEFAULTS[mode]?.rolePrompt ?? ''])
)

const customPrompts = reactive<Record<string, { rolePrompt: string }>>({})
modes.forEach((mode) => {
  const cached = getCustomModePrompts()[mode]
  customPrompts[mode] = { rolePrompt: cached?.rolePrompt ?? '' }
})

const bindingsCache = getModeServiceBindings()
const serviceBindings = reactive<Record<string, string>>(
  Object.fromEntries(
    modes.map((mode) => {
      const boundId = bindingsCache[mode] ?? ''
      const isValid =
        boundId === '' ||
        getBindableServicesForMode(mode).some((service) => service.id === boundId)
      if (!isValid) {
        setModeServiceBinding(mode, '')
        return [mode, '']
      }
      return [mode, boundId]
    })
  )
)

const savePrompts = (showMessage = false): void => {
  const toSave: CustomModePrompts = {}
  modes.forEach((mode) => {
    const text = customPrompts[mode]?.rolePrompt?.trim()
    if (text) {
      toSave[mode] = { rolePrompt: text }
    }
  })
  setCustomModePrompts(toSave)
  if (showMessage) {
    ElMessageExtend.success('Prompt 已保存')
  }
}

const resetPrompt = (mode: string): void => {
  customPrompts[mode].rolePrompt = ''
  resetCustomRolePrompt(mode)
  savePrompts(false)
}

const onBindingChange = (mode: string, serviceId: string): void => {
  setModeServiceBinding(mode, serviceId ?? '')
  clearBindingFallbackWarnCache()
  ElMessageExtend.success('翻译源绑定已保存')
}
</script>

<style lang="scss" scoped>
@import '../../../css/set.scss';

.translate-mode-settings {
  padding: 0 10px 20px 10px;

  .settings-hint {
    font-size: 12px;
    color: var(--ttime-tips-text-color);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .prompt-actions {
    margin-top: 6px;
  }
}
</style>