<template>
  <div class="translate-mode-block">
    <a
      v-for="mode in modes"
      :key="mode"
      class="translate-mode-item none-select function-tools"
      :class="{ 'translate-mode-active': currentMode === mode }"
      @click="selectMode(mode)"
    >
      {{ mode }}
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TranslateModeEnum from '../../../../common/enums/TranslateModeEnum'
import { getTranslateMode, setTranslateMode } from '../../utils/translateModeUtil'

const modes = TranslateModeEnum.ALL
const currentMode = ref(getTranslateMode())

const emit = defineEmits(['mode-changed'])

const selectMode = (mode: string): void => {
  setTranslateMode(mode)
  currentMode.value = mode
  emit('mode-changed', mode)
}

const refreshMode = (): void => {
  currentMode.value = getTranslateMode()
}

defineExpose({ refreshMode })
</script>

<style lang="scss" scoped>
@import '../../css/translate.scss';

.translate-mode-block {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 0 12px 8px 12px;
  padding: 6px;
  border-radius: 7px;
  background: var(--ttime-translate-input-color-background);

  .translate-mode-item {
    padding: 4px 14px;
    font-size: 13px;
    border-radius: 5px;
    color: var(--ttime-text-color);
    background: var(--ttime-translate-language-background);
  }

  .translate-mode-active {
    background: var(--ttime-translate-language-active-background);
  }
}
</style>
