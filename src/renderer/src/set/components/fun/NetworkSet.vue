<template>
  <div>
    <div class="network-layer">
      <el-form label-width="120px">
        <el-form-item label="代理模式">
          <el-radio-group v-model="agentConfig.proxyScope" @change="onProxyScopeChange">
            <el-radio :label="ProxyScopeEnum.GLOBAL">全局代理</el-radio>
            <el-radio :label="ProxyScopeEnum.PER_SERVICE">按翻译源配置</el-radio>
          </el-radio-group>
          <span class="form-switch-span block-hint">
            「按翻译源配置」下窗口默认直连，仅在翻译源设置中启用了代理的源才会走代理
          </span>
        </el-form-item>
        <el-form-item label="代理设置">
          <el-select v-model="agentConfig.type">
            <el-option
              v-for="model in agentSelectList"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
        </el-form-item>

        <div v-if="agentConfig.type === 1">
          <el-form-item label="服务器">
            <el-input
              v-model="agentConfig.host"
              class="network-input"
              type="text"
              placeholder="请输入地址IP"
              spellcheck="false"
            />
          </el-form-item>
          <el-form-item label="端口">
            <el-input
              v-model="agentConfig.port"
              class="network-input"
              type="text"
              placeholder="请输入端口"
              spellcheck="false"
            />
          </el-form-item>
        </div>
        <el-form-item>
          <el-button plain @click="save">保存</el-button>
          <span class="form-switch-span form-switch-button-span">
            {{
              agentConfig.proxyScope === ProxyScopeEnum.PER_SERVICE
                ? '按源模式下请在各翻译源中单独开启「使用代理」'
                : agentConfig.type === 0
                ? ''
                : '全局模式下所有请求通过代理执行'
            }}
          </span>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { isNull } from '../../../../../common/utils/validate'
import ElMessageExtend from '../../../utils/messageExtend'
import { cacheGet, cacheSet } from '../../../utils/cacheUtil'
import { ProxyScopeEnum } from '../../../../../common/enums/ProxyScopeEnum'

const agentConfig = ref(cacheGet('agentConfig') ?? { type: 0, host: '', port: '', proxyScope: 0 })
if (agentConfig.value.proxyScope === undefined) {
  agentConfig.value.proxyScope = 0
}

const agentSelectList = [
  { label: '不使用代理', value: 0 },
  { label: 'HTTP代理', value: 1 }
]

const onProxyScopeChange = (): void => {
  cacheSet('agentConfig', agentConfig.value)
  window.api.agentUpdateEvent(agentConfig.value)
}

const save = (): void => {
  if (agentConfig.value.type === 1) {
    if (isNull(agentConfig.value.host) || isNull(agentConfig.value.port)) {
      return ElMessageExtend.warning('代理地址或端口号不能为空')
    }
  }
  cacheSet('agentConfig', agentConfig.value)
  ElMessageExtend.success('保存成功')
  setTimeout(() => window.api.agentUpdateEvent(cacheGet('agentConfig')), 500)
}
</script>

<style lang="scss" scoped>
@import '../../../css/set.scss';

.network-layer {
  display: flex;
  max-height: 500px;
  min-height: 500px;

  .form-switch-button-span {
    margin-left: 15px;
  }

  .block-hint {
    display: block;
    margin-top: 6px;
    margin-left: 0;
  }
}
</style>
