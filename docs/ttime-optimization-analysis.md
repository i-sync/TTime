# TTime AI 翻译优化分析与改造方案

> 文档版本：v1.3（实施完成版）  
> 日期：2026-06-17  
> 用途：汇总需求分析、现状差距与分阶段改造计划  
> **实施状态**：Phase 1–3 已完成（`6dac552` / `dfa10b9` / `8b47cc1`）；#13 不实施

---

## 1. 背景

TTime 是一款基于 Electron 的桌面翻译工具，支持输入翻译、截图翻译、划词翻译、OCR 等功能。项目开源，技术栈为 Electron + Vue 3 + TypeScript。

本文档针对**后端开发者向英国客户用英文解释问题和回复**的场景，分析现有能力差距，并提出可落地的改造方案。

---

## 2. 用户场景

### 2.1 角色与沟通对象

- **角色**：后端开发工程师
- **沟通对象**：英国客户，主要通过英文提需求
- **沟通内容**：解释模块功能、技术逻辑等

### 2.2 核心工作流

```
写英文草稿 → 润色（EN→EN）→ 发给客户
                ↑
         对照翻译（EN→CN）校验意思是否准确
                ↑
         点击切换（⇄）做反向验证（类似 DeepL）
```

### 2.3 典型语言方向

| 场景 | 输入 | 输出 | 目的 |
|------|------|------|------|
| **润色** | 英文草稿 | 优化后的英文 | 修正语法，生成可发送的专业技术英文 |
| **对照** | 英文草稿 | 中文直译 | 检查「我想表达的意思」是否准确，避免误会 |
| **翻译** | 中文 | 英文 | 先用中文想清楚逻辑，再生成英文 |
| **反向验证** | 中文（上轮结果） | 英文 | 通过切换按钮做 round-trip 检查 |

### 2.4 示例

**输入草稿：**
```
the token will expire and api return 401
```

**润色后（发给客户）：**
```
The API returns a 401 status code when the token has expired.
```

**对照中文（校验意思）：**
```
当 token 过期时，API 会返回 401 状态码。
```

---

## 3. 现状分析

### 3.1 项目架构概览

```
渲染进程 (Vue 3)
  ├── 主翻译窗口 (Input + LanguageSelect + Result)
  ├── 设置窗口 (翻译源配置)
  └── ChannelRequest (OpenAI/TTimeAI 等 HTTP 请求)

主进程 (Electron)
  ├── GlobalShortcutEvent (快捷键)
  ├── TranslateChannelFactory (翻译源路由)
  ├── StoreService (配置持久化)
  └── RequestUtil (代理注入 injectWinAgent)

共享层 (src/common)
  ├── TranslateServiceEnum (翻译源枚举)
  └── channel/translate/info/*.ts (各源语言列表与配置)
```

### 3.2 当前 AI 相关翻译源

| 翻译源 | 可自定义 | 说明 |
|--------|---------|------|
| **TTimeAI** | 否（内置） | 走官方云 API `ink.timerecord.cn`，需登录 token，会员功能 |
| **OpenAI** | 部分 | 可配 API Key、请求地址；模型仅能从 gpt-3.5 下拉列表选择 |
| **AzureOpenAI** | 是 | 可配 Key、Endpoint、部署名（`deploymentName`，非 OpenAI 式 model 字段） |

### 3.3 AI 特殊能力的位置

AI 能力（文字润色、总结、分析、解释代码）**没有独立入口**，而是混在「目标语言」列表中：

- 文件：`src/common/channel/translate/info/OpenAIInfo.ts`
- 选项：`文字润色`、`总结`、`分析`、`解释代码`

Prompt 硬编码在以下文件中（逻辑重复）：

- `src/renderer/src/channel/OpenAIChannelRequest.ts`（当前通过 `languageResultType === '文字润色'` 等分支选择 Prompt）
- `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`

TTimeAI 将 `languageType` / `languageResultType` 发往远端 API，**无法在本地自定义 Prompt**。

### 3.4 默认安装的翻译源

首次启动默认只有：

- TTime 翻译
- Bing 词典（内置）
- DeepL（内置）
- 小牛翻译（内置）

**不包含任何 AI 翻译源**，需手动在设置中添加 TTimeAI 或 OpenAI。因此即使代码里已实现 AI 模式（见 3.3），用户在未添加 AI 源前也**无法在语言列表中发现**「文字润色」等选项。

### 3.5 自动语言识别逻辑

`src/renderer/src/utils/languageUtil.ts` 写死了：

- 英文输入 → 中文输出
- 中文输入 → 英文输出

**不支持**英文 → 英文润色，每次需手动选择「英语 → 文字润色」。且 `Input.vue` 仅在 `translateFun()` 内部局部解析 AUTO，**不写回** `inputLanguage` / `resultLanguage` cache。

### 3.6 结果文本读取能力缺失

`Input.vue` 通过 `defineExpose` 暴露了 `getTranslateContent` / `setTranslateContent`，但 `InputResultContentChannel.vue` 仅暴露 `setTranslatedResultContent`，**没有结果文本 getter**。DeepL 式切换需要父子组件协同读写两侧文本，当前架构不支持。

`InputResultContent.vue` 为**每个已启用翻译源**渲染独立 channel，与后续「按模式过滤参与翻译的源」存在不同步风险（见 5.3 C、5.6）。

---

## 4. 核心差距（vs 用户需求）

### 4.1 切换按钮不像 DeepL（最关键）

**现状代码**（`LanguageSelect.vue`）：

```typescript
const clickLanguageExchange = (): void => {
  const inputLanguageSelect = cacheGet('inputLanguage')
  const resultLanguageSelect = cacheGet('resultLanguage')
  inputLanguageSelectClick(resultLanguageSelect)
  resultLanguageSelectClick(inputLanguageSelect)
}
```

| 行为 | DeepL | TTime 现状 |
|------|-------|-----------|
| 交换语言方向 | ✅ | ✅ |
| 交换输入/结果文本 | ✅ `hello→你好` 变成 `你好→hello` | ❌ 只换标签 |
| 切换后自动重新翻译 | ✅ | ❌ |
| 润色结果作为新输入继续操作 | ✅ | ❌ 需手动复制 |

此外，朴素「语言标签对调」在润色场景会失效：`英语 → 文字润色` 对调后变成 `文字润色 → 英语`，`文字润色` 是伪目标语言而非真实源语言，会导致非 AI 源报错。

### 4.2 TTimeAI 不可自定义

- `isKey: false` → 设置页显示「内置翻译源 - 无需配置」
- 无法修改 API 地址、模型、Prompt
- 依赖官方云服务与登录 token

### 4.3 OpenAI 可自定义但难发现

OpenAI / AzureOpenAI **代码层面已支持**与 TTimeAI 相同的 AI 模式，但因 3.4 所述默认未安装 AI 源，用户通常找不到入口。此外：

- AI 模式与 100+ 语言混在一个下拉里
- 没有「翻译模式」专区
- 自定义请求地址已可用，但模型列表过时（仅 gpt-3.5），**不支持自由输入模型名**

### 4.4 多翻译源并行报错

翻译时遍历所有已启用源，非 AI 源不支持「文字润色」时会显示「不支持翻译当前语言结果」，多源同时开启时体验混乱。

### 4.5 Prompt 不适合技术英文沟通

现有「文字润色」Prompt 为通用润色，缺少：

- 保留技术术语（API 名、状态码、中间件等）
- 后端工程师向客户解释代码的语境
- 忠实直译 vs 润色的模式区分

### 4.6 代理全局化影响速度

- 设置 → 网络 → 代理：开启后**所有请求**走代理
- OpenRouter 部分模型需代理，但 DeepL 等直连源也被拖慢
- 代理注入位于 **`src/main/utils/RequestUtil.ts`**（`injectWinAgent`），由 `src/main/index.ts` 和 `src/main/service/IpcMainHandle.ts` 调用
- 渲染进程中的 `fetchEventSource`（OpenAI/OpenRouter）走 **Electron session 级代理**，与主进程共用同一套网络代理配置

---

## 5. 改造方案

### 5.1 新增「翻译模式」（独立于语言列表）

| 模式 | 语言方向 | 用途 | Phase 1 默认翻译源 |
|------|---------|------|-------------------|
| **润色** | 英语 → 英语 | 生成可发给客户的专业技术英文 | OpenAI / AzureOpenAI（开发者 Prompt）；TTimeAI 可选（沿用服务端 Prompt） |
| **对照** | 英语 → 中文 | 忠实直译，校验意思是否准确 | DeepL 内置 → DeepL API Key → AI 回退 |
| **翻译** | 中文 → 英语 | 中文想清楚后生成英文 | OpenAI / AzureOpenAI（开发者 Prompt）；TTimeAI 可选 |

可选第四模式（Phase 2 评估）：**代码解释**（英文输出，面向客户解释逻辑）。

**切换模式时自动重置语言对（Phase 1）：**

| 切换到 | 自动设置 inputLanguage | 自动设置 resultLanguage |
|--------|----------------------|------------------------|
| 润色 | 英语 | 英语 |
| 对照 | 英语 | 中文(简体) |
| 翻译 | 中文(简体) | 英语 |

润色模式下语言选择器**只读或隐藏目标侧**（固定 EN→EN）；对照/翻译模式允许手动调整。按模式记忆语言对留 Phase 2（§6 #11）。

**设计决策：**

- 「对照」Phase 1 **默认走 DeepL 内置**（`DEEP_L_BUILT_IN`），已启用 API Key 版 DeepL（`DEEP_L`）作为次选，最后才 AI + 忠实 Prompt。
- Section 5.2 中的「对照 Prompt」仅用于 **DeepL 均不可用时的 AI 回退**。
- Phase 2 再支持用户为每种模式手动绑定翻译源。

**持久化键：**

- `translateMode` — 当前模式
- `inputLanguage` / `resultLanguage` — 语言对（切换模式时由 5.1 表自动写入）

### 5.2 开发者专用 Prompt 预设

Prompt 抽取到共享模块 `src/common/channel/translate/DeveloperPromptPresets.ts`，**仅由 OpenAI / AzureOpenAI 通道引用**。TTimeAI 不在 Phase 1 本地 Prompt 范围（依赖 `ink.timerecord.cn` 服务端逻辑）。

**请求链路变更（关键）：**

`Input.vue` 的 `buildTranslateRequestInfo()` 必须新增 `translateMode` 字段，随每次翻译请求下发：

```typescript
{
  channel: 0,
  translateContent: string,
  languageType: string,        // 真实语言，如 'English'、'中文(简体)'
  languageResultType: string,  // 真实语言，不再用「文字润色」作伪目标
  translateMode: '润色' | '对照' | '翻译'  // 新增
}
```

`OpenAIChannelRequest.ts` / `AzureOpenAIChannelRequest.ts` 改为根据 **`translateMode`** 选择 `DeveloperPromptPresets`，逐步废弃 `languageResultType === '文字润色'` 等伪语言分支。

**润色模式（OpenAI / AzureOpenAI）：**
```
You are a senior backend engineer writing to an international client.
Polish the text to clear, professional British English.
Preserve all technical terms, API names, status codes, and logic exactly.
Fix grammar only; do not change meaning or add information.
```

**对照模式（仅 AI 回退时使用）：**
```
Translate faithfully to Simplified Chinese.
Prioritize accuracy over fluency.
Keep technical terms recognizable (e.g. token, middleware, callback).
```

**翻译模式（OpenAI / AzureOpenAI）：**
```
Translate to clear, professional British English for an international client.
Preserve technical accuracy. Use natural phrasing suitable for explaining backend logic.
```

Phase 2 支持在设置页覆盖以上预设。

### 5.3 切换与「用结果替换输入」行为

切换逻辑**按模式区分**，不能对所有场景套用同一套 DeepL 式标签对调。

#### A. 对照 / 翻译模式 — 完整 DeepL 式切换

适用于对称语言对（如 `英语 ⇄ 中文(简体)`）：

```typescript
function onSwapSymmetric() {
  // 0. 解析 AUTO 并写回 cache + 更新 LanguageSelect UI
  resolveAndPersistAutoLanguage()  // cacheSet + 刷新 languageSelect 显示

  // 1. 交换语言方向（写回 cache）
  swap(inputLanguage, resultLanguage)

  // 2. 交换文本（读取「主结果源」文本，见 5.3 C）
  const temp = getTranslateContent()
  setTranslateContent(getPrimaryResultContent())
  setPrimaryResultContent(temp)

  // 3. 自动重新翻译
  triggerTranslate()
}
```

#### B. 润色模式 — 模式联动（非朴素标签对调）

```typescript
function onPolishToVerify() {
  setTranslateContent(getPrimaryResultContent())
  setTranslateMode('对照')           // 触发 5.1 默认语言对：英语 → 中文
  triggerTranslate()
}
```

**切换按钮在润色模式下的行为：** 触发 `onPolishToVerify()`，而非 `onSwapSymmetric()`。

#### C. 「用结果替换输入」与主结果源（Phase 1）

独立按钮：将**主结果源**文本写入输入框，清空该源结果区，不自动翻译。

**主结果源定义（与 §5.6 路由一致，非全局 index）：**

```typescript
function getPrimaryResultService(): TranslateService {
  // 取当前 translateMode 下第一个「参与翻译」的源
  return getActiveServicesForMode(translateMode)[0]
}

function getPrimaryResultContent(): string {
  const service = getPrimaryResultService()
  return getChannelByServiceId(service.id).getTranslatedResultContent()
}
```

`InputResultContent.vue` 需提供按 `serviceId` 定位 channel 并读取结果的 API。Phase 2 支持用户指定「主显示源」。

### 5.4 建议 UI 布局

```
┌──────────────────────────────────────────────┐
│  [润色]  [对照]  [翻译]          ← 模式切换   │
├──────────────────────────────────────────────┤
│  英语  ⇄  中文                   ← 语言方向   │
│         （润色模式：固定 英语 → 英语，只读）    │
├──────────────────────────────────────────────┤
│  输入区：英文草稿 / 中文思路                   │
├──────────────────────────────────────────────┤
│  结果区：润色英文 / 中文对照                   │
│  [复制] [用结果替换输入] [切换 ⇄]             │
└──────────────────────────────────────────────┘
```

- **对照 / 翻译模式**：`⇄` → `onSwapSymmetric()`
- **润色模式**：`⇄` → `onPolishToVerify()`

### 5.5 OpenAI 兼容 API 增强

在现有 OpenAI 翻译源上扩展，**不新增独立枚举类型**。

| 配置项 | Phase 1 现状 | Phase 1 改造 |
|--------|-------------|-------------|
| 请求地址 | 已支持自定义 | 增加 URL 校验与说明 |
| 模型（OpenAI） | 仅 gpt-3.5 下拉 | **改为可自由输入** + 常用模型快捷选项 |
| 模型（AzureOpenAI） | 使用 `deploymentName` | **不在 Phase 1 改造范围**（现有 deployment 配置已足够） |
| AppKey | 已支持 | 不变 |
| 代理 | 全局 | Phase 2 按源配置 |

**请求地址拼接规则：** 客户端固定追加 `/v1/chat/completions`，`requestUrl` **不得包含** `/v1` 后缀。

```
# OpenRouter（正确）
请求地址: https://openrouter.ai/api
模型: anthropic/claude-3.5-sonnet

# Ollama（正确）
请求地址: http://localhost:11434
模型: llama3
```

### 5.6 按模式路由翻译源

在 `Input.vue` 的 `translateFun()` 中，遍历 `translateServiceMap` **之前**按 `translateMode` 过滤，得到 `activeServices`：

| 模式 | Phase 1 参与翻译的源（按优先级） |
|------|--------------------------------|
| **润色** | OpenAI → AzureOpenAI → TTimeAI |
| **对照** | `DEEP_L_BUILT_IN` → `DEEP_L` → OpenAI → AzureOpenAI → TTimeAI（AI 路径使用忠实 Prompt） |
| **翻译** | OpenAI → AzureOpenAI → TTimeAI |

仅对 `activeServices` 构建 `requestMap` 并发起请求；**不对**被跳过的源调用 `apiTranslateResultMsgCallbackEvent`。

**空态处理（Phase 1）：** 若 `activeServices` 为空（例如润色模式未配置任何 AI 源），显示单条明确提示，例如：

> 「当前模式无可用翻译源，请在设置中添加 OpenAI 或启用 DeepL 内置」

不触发多源「不支持翻译当前语言」噪音。

### 5.7 旧「伪语言」项与新模式的关系（Phase 1）

模式 UI 上线后，当用户通过 `translateMode` 操作时：

- **对 OpenAI / AzureOpenAI 源**：语言选择器仅展示真实语言（英/中等），**隐藏**「文字润色」「总结」「分析」「解释代码」等伪语言项。
- **向后兼容（旧路径保留）**：若用户 cache 里仍保存了「英语 → 文字润色」等旧语言对，或从旧版本升级而来，请求会走 `languageResultType === '文字润色'` 等**旧 Prompt 分支**（见 `OpenAIChannelRequest.ts`）。这与新模式 `translateMode` 驱动 Prompt **并存**，即下文所称「伪语言旧路径」。
- **#13 不实施**：不新增第四模式「代码解释」，**不删除**旧伪语言代码与配置。正常使用新 UI 的用户不会接触到旧路径。

这样避免双入口与 §4.4 类多源噪音；对日常用户无感知，仅影响维护时需知存在两套 Prompt 触发方式。

### 5.8 模式与翻译源绑定（第二阶段）

允许用户为每种模式手动指定翻译源，覆盖 5.6 的默认路由。

---

## 6. 分阶段实施计划

### 第一阶段 — 直接改善日常开发沟通（优先）

| # | 功能 | 涉及文件（预估） |
|---|------|-----------------|
| 1 | 翻译模式 + 持久化 + 切换时重置语言对 | 新建 `TranslateModeEnum.ts`; 改 `LanguageSelect.vue`, `languageUtil.ts` |
| 2 | 按模式路由翻译源 + 空态提示（5.6） | `Input.vue` |
| 3 | `translateMode` 进入请求体 + 共享 Prompt | 新建 `DeveloperPromptPresets.ts`; 改 `Input.vue`（`buildTranslateRequestInfo`）, `OpenAIChannelRequest.ts`, `AzureOpenAIChannelRequest.ts` |
| 4 | OpenAI 模型名自由输入 + URL 说明 | `TranslateService.vue`, `OpenAIModelEnum.ts`（Azure `deploymentName` 不变） |
| 5 | 主结果源 getter + 按 serviceId 读 channel | `InputResultContentChannel.vue`, `InputResultContent.vue`, `Translate.vue` |
| 6 | DeepL 式切换 + `resolveAndPersistAutoLanguage` | `LanguageSelect.vue`, `Input.vue`, `Translate.vue` |
| 7 | 「用结果替换输入」按钮 | `Translate.vue` |
| 8 | AI 源语言列表隐藏伪语言项（5.7） | `ChannelLanguage.ts` 或 `LanguageSelect.vue` |

### 第二阶段 — 配置灵活性

| # | 功能 |
|---|------|
| 9 | 设置页自定义 Prompt |
| 10 | 模式与翻译源绑定（5.8） |
| 11 | 按翻译源配置代理（非全局） |
| 12 | 按模式记忆最近语言对 |
| 13 | ~~可选第四模式「代码解释」；移除旧伪语言路径~~ **不实施**（见 §13 实施说明） |

### 第三阶段 — 工作流自动化

| # | 功能 |
|---|------|
| 14 | 一键「润色 + 对照」双输出 |
| 15 | 划词翻译默认对照模式 |
| 16 | 剪贴板监听：检测英文自动对照 |
| 17 | Round-trip 检查提示（EN→CN→EN） |

### 实施记录与 Git 提交

| 阶段 | 提交 | 说明 |
|------|------|------|
| Phase 1 | `6dac552` | 翻译模式、路由、translateMode 请求链路、DeepL 式切换 |
| Phase 2 | `dfa10b9` | 自定义 Prompt、模式绑定、按源代理、按模式记忆语言对 |
| Phase 3 | `8b47cc1` | 润色+对照双输出、划词/剪贴板自动对照、Round-trip 提示 |

**完成度：16/17**（#13 明确不做）。

### §13 不实施说明

产品决策：**不需要**独立「代码解释」模式，也**不需要**删除旧伪语言相关代码。

- 新工作流完全通过顶部 **[润色] [对照] [翻译]** 完成，语言列表里的「文字润色」「解释代码」等项在模式 UI 下已隐藏。
- 旧代码保留仅为**升级用户**或**异常 cache** 的兼容，不影响新用户日常使用。

---

## 7. 核心代码改动点

```
src/common/enums/
  ├── TranslateModeEnum.ts
  └── TranslateContentSourceEnum.ts     # Phase 3：划词/剪贴板来源

src/common/channel/translate/
  ├── DeveloperPromptPresets.ts
  └── ModePromptDefaults.ts             # Phase 2：可覆盖默认 Prompt

src/renderer/src/utils/
  ├── translateModeUtil.ts              # 模式路由、语言对、绑定回退
  ├── translateModeConfigUtil.ts        # Phase 2：Prompt / 绑定 / 语言对记忆
  ├── translateExecutionUtil.ts         # Phase 3：执行计划、双输出
  ├── translateExternalEntryUtil.ts     # Phase 3：外部内容入口
  ├── translateRoundTripHintUtil.ts     # Phase 3：Round-trip 提示
  ├── proxyUtil.ts                      # Phase 2：按源代理
  └── languageUtil.ts

src/renderer/src/translate/
  ├── Translate.vue
  ├── composables/useTranslateWorkflow.ts
  ├── components/TranslateModeSelect.vue
  ├── components/LanguageSelect.vue
  ├── components/Input.vue
  ├── components/InputResultContent.vue
  └── components/channel/InputResultContentChannel.vue

src/renderer/src/set/components/fun/
  ├── TranslateModeSettings.vue         # Phase 2
  └── AdvancedInfo.vue                  # Phase 3 工作流开关

src/renderer/src/channel/
  ├── OpenAIChannelRequest.ts           # translateMode 优先；旧伪语言分支保留
  └── AzureOpenAIChannelRequest.ts
```

---

## 8. 推荐日常用法（改造后）

1. **设置 → 翻译源**：添加 OpenAI（可选 OpenRouter）+ 启用 DeepL 内置
2. **主窗口**：点 **[润色] / [对照] / [翻译]**，无需再从语言列表找「文字润色」
3. **英文沟通**：输入草稿 → **润色+对照** 或先润色再点 **⇄** 做 round-trip
4. **划词 / 复制英文**：默认自动切到对照模式（可在 设置 → 高级 关闭）
5. **代理**：在翻译源配置里按源开启 `useProxy`，不必全局拖慢 DeepL

> 旧用法「英语 → 文字润色」仍可能因历史配置生效，但 UI 已隐藏该入口，新用户无需了解。

---

## 9. 模型与源选型建议

| 用途 | Phase 1 推荐 | 原因 |
|------|-------------|------|
| 英文润色 | OpenRouter Claude / GPT-4o（OpenAI 源 + 开发者 Prompt） | 英文自然，技术语境可控 |
| 中英对照 | **DeepL 内置** | 准确、低延迟 |
| 中译英 | OpenAI / AzureOpenAI + 开发者 Prompt | 需理解技术语境 |
| TTimeAI | 可选；Prompt 不可本地控制 | 免配置但依赖会员/登录 |

---

## 10. 总结

### 需求一句话

> **像 DeepL 一样双向验证意思，像 AI 一样润色技术英文，像开发者一样解释代码逻辑。**

### 改造后能力（相对原文档 §4 缺口）

| 原缺口 | 状态 |
|--------|------|
| 切换不像 DeepL | ✅ 对照/翻译：`onSwapSymmetric`；润色：`onPolishToVerify` |
| 无 translateMode 链路 | ✅ `translateExecutionUtil` + `DeveloperPromptPresets` |
| 润色入口太深 | ✅ 顶部模式切换 + 润色+对照按钮 |
| 代理全局化 | ✅ 按源 `useProxy`（Phase 2） |
| OpenAI 模型不可自由输入 | ✅ `allow-create` 模型名（Phase 1） |
| 多源并行报错噪音 | ✅ 按模式路由，空态单条提示 |

### 已知小边界（不阻塞使用）

- 对照 API **业务失败**时若走 `okIT` 错误文案，偶发误弹 Round-trip 成功提示（主路径正常）
- 双输出主结果源依赖 cache 中的 `dualOutput*` 键，清空内容时会重置

---

## 11. 设计决策记录

| 决策项 | 结论 |
|--------|------|
| 模式命名 | 润色 / 对照 / 翻译 |
| 切换模式时语言对 | Phase 1 自动重置（§5.1 表） |
| 对照 DeepL 优先级 | `DEEP_L_BUILT_IN` → `DEEP_L` → AI |
| 主结果源 | 当前模式下第一个参与翻译的源（非全局 index） |
| Prompt 适用范围 | OpenAI / AzureOpenAI；TTimeAI 沿用服务端 |
| 切换行为 | 对照/翻译：`onSwapSymmetric`；润色：`onPolishToVerify` |
| AUTO 与切换 | `resolveAndPersistAutoLanguage` 写回 cache + 更新 UI |
| 伪语言项 | Phase 1 模式 UI 下隐藏；旧路径保留不推荐 |
| OpenAI 兼容源 | 扩展现有 OpenAI 配置 |
| Azure 模型改造 | Phase 1 不改（deploymentName 已足够） |
| 空态 | `activeServices` 为空时单条提示 |
| 按源代理 / 自定义 Prompt | Phase 2 ✅ |
| Phase 3 工作流自动化 | Phase 3 ✅ |
| #13 代码解释 / 移除伪语言 | **不实施** |

---

## 12. 验收标准（实施结果）

### Phase 1

- [x] 三种模式可切换并持久化；切换模式时语言对按 §5.1 表自动重置
- [x] **润色**：EN→EN，路由至 AI 源；OpenAI/Azure 使用开发者润色 Prompt（`translateMode` 驱动）
- [x] **TTimeAI 润色**：沿用服务端 Prompt（`文字润色` 伪语言类型）
- [x] **对照**：EN→CN；优先 `DEEP_L_BUILT_IN`，其次 `DEEP_L`，最后 AI 忠实 Prompt
- [x] **翻译**：CN→EN；OpenAI/Azure 使用开发者翻译 Prompt
- [x] 请求体包含 `translateMode`（`translateExecutionUtil.buildRequestInfo`）
- [x] **对照/翻译 `⇄`**：交换语言 + 文本 + 自动重译；AUTO 写回 cache
- [x] **润色 `⇄`**：`onPolishToVerify`
- [x] **「用结果替换输入」**：主结果源文本写入输入框
- [x] OpenAI 模型自由输入；URL 规则说明（不含 `/v1`）
- [x] 模式 UI 下语言列表不展示伪语言项
- [x] 无可用源时单条空态提示

> **说明**：新模式下 Prompt 由 `translateMode` 驱动。`OpenAIChannelRequest` 中 `languageResultType === '文字润色'` 等分支**仍保留**作旧配置兼容，不视为验收失败（见 §5.7、§13）。

### Phase 2

- [x] #9 设置页自定义 Prompt
- [x] #10 模式与翻译源绑定
- [x] #11 按翻译源配置代理
- [x] #12 按模式记忆语言对
- [—] #13 不实施

### Phase 3

- [x] #14 一键润色+对照双输出
- [x] #15 划词翻译默认对照模式
- [x] #16 剪贴板英文自动对照
- [x] #17 Round-trip 检查提示

---

*文档结束*