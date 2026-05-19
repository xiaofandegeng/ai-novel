import type { Component } from 'vue'
import { useToast } from '@ai-novel/ui'
import {
  Calendar,
  Globe,
  Info,
  ShieldAlert,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useProjectStore } from '@/stores/project.store'
import { useStoryBibleStore } from '@/stores/story-bible.store'

export interface StoryBibleSection {
  id: string
  label: string
  icon: Component
  field: string
  placeholder: string
}

export interface ProcessedStoryBibleSuggestion {
  raw: string
  cleaned: string
  removedNotes: string[]
}

export interface StoryBibleForm {
  worldview: string
  mainConflict: string
  theme: string
  rules: string
  timeline: string
}

export const sections: StoryBibleSection[] = [
  { id: 'worldview', label: '世界观', icon: Globe, field: 'worldview', placeholder: '描述魔法系统、地理环境、社会结构等...' },
  { id: 'conflict', label: '核心矛盾', icon: Zap, field: 'mainConflict', placeholder: '故事的驱动力是什么？冲突的各方分别想要什么？' },
  { id: 'theme', label: '核心主题', icon: Info, field: 'theme', placeholder: '救赎、牺牲、技术 vs 自然...' },
  { id: 'rules', label: '铁律与禁忌', icon: ShieldAlert, field: 'rules', placeholder: '这个世界中有哪些不可动摇的基本法则？' },
  { id: 'timeline', label: '大事年表', icon: Calendar, field: 'timeline', placeholder: '导致故事当前状态的关键历史事件...' },
]

function buildStoryBiblePrompt(prompt: string, sectionLabel: string) {
  return [
    prompt,
    '',
    `请只输出可直接写入【${sectionLabel}】设定栏的内容。`,
    '要求：',
    '1. 不要输出 Markdown 加粗、分割线、代码块或标题装饰。',
    '2. 不要向作者提问，不要写"作者决策点""请告知倾向"等对话式内容。',
    '3. 如果有待决策内容，请直接整理成"待定：..."设定草案。',
    '4. 内容要保持设定口吻，便于自动驾驶引擎检查后追加或替换到设定集中。',
  ].join('\n')
}

function normalizeStoryBibleSuggestion(raw: string): ProcessedStoryBibleSuggestion {
  const removedNotes: string[] = []
  const cleanedLines: string[] = []
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split('\n')

  let inDecisionBlock = false

  for (const sourceLine of lines) {
    const trimmed = sourceLine.trim()

    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines.at(-1) !== '')
        cleanedLines.push('')
      continue
    }

    const line = trimmed
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/^\s*\*\s+/, '- ')
      .trim()

    if (/^-{3,}$/.test(line))
      continue

    const isDecisionHeading = /^(?:作者决策点|决策点|需要处理|下一步处理|请你选择|请告知)/.test(line)
    const isAssistantMeta = /请告知|告诉我你的倾向|我将据此|下一阶段|进入下一阶段|如果你愿意|我可以继续|是否需要|你倾向于/.test(line)

    if (isDecisionHeading) {
      inDecisionBlock = true
      removedNotes.push(line)
      continue
    }

    if (inDecisionBlock) {
      removedNotes.push(line)
      continue
    }

    if (/^(?:好的|当然|以下是|下面是|我建议|建议如下|分析如下)[：:,，]?/.test(line))
      continue

    if (isAssistantMeta) {
      removedNotes.push(line)
      continue
    }

    cleanedLines.push(line)
  }

  const cleaned = cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    raw,
    cleaned,
    removedNotes,
  }
}

export function useStoryBibleWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const storyBibleStore = useStoryBibleStore()

  const loading = ref(true)
  const saving = ref(false)
  const activeSection = ref('worldview')

  const form = ref<StoryBibleForm>({
    worldview: '',
    mainConflict: '',
    theme: '',
    rules: '',
    timeline: '',
  })

  // --- AI Section ---
  const { isStreaming: isBrainstorming, stream: streamAI } = useAIStream()

  const aiSuggestion = ref<ProcessedStoryBibleSuggestion | null>(null)
  const aiError = ref('')

  async function handleAIBrainstorm(customPrompt?: string) {
    const section = sections.find(s => s.id === activeSection.value)
    const prompt = customPrompt || `基于当前项目主题"${projectStore.currentProject?.theme || '未定义'}"，为作品的"${section?.label}"部分提供一些深入的构思建议。`

    aiSuggestion.value = null
    aiError.value = ''

    try {
      const raw = await streamAI({
        projectId,
        scene: 'story_bible',
        userInstruction: buildStoryBiblePrompt(prompt, section?.label || '故事设定'),
      })
      const processed = normalizeStoryBibleSuggestion(raw)
      aiSuggestion.value = processed

      if (!processed.cleaned)
        aiError.value = 'AI 返回内容没有可直接写入设定的部分，请调整提示后重试。'
    }
    catch (error: any) {
      aiError.value = error.message || 'AI 辅助构思失败'
      toast.add(aiError.value, 'error')
    }
  }

  function handleApplyAI(action: 'append' | 'replace') {
    const suggestion = aiSuggestion.value?.cleaned.trim()
    if (!suggestion)
      return

    const section = sections.find(s => s.id === activeSection.value)
    if (!section)
      return

    const field = section.field as keyof StoryBibleForm
    if (action === 'append') {
      form.value[field] = (form.value[field] ? `${form.value[field]}\n\n` : '') + suggestion
    }
    else {
      form.value[field] = suggestion
    }

    aiSuggestion.value = null
    aiError.value = ''
    toast.add('已应用 AI 建议', 'success')
  }

  function dismissAISuggestion() {
    aiSuggestion.value = null
    aiError.value = ''
  }

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        storyBibleStore.fetchStoryBible(projectId),
      ])

      if (storyBibleStore.storyBible) {
        const b = storyBibleStore.storyBible
        form.value = {
          worldview: b.worldview || '',
          mainConflict: b.mainConflict || '',
          theme: b.theme || '',
          rules: b.rules || '',
          timeline: b.timeline || '',
        }
      }
    }
    catch {
      toast.add('加载故事设定集失败，请稍后重试', 'error')
    }
    finally {
      loading.value = false
    }
  })

  async function handleSave() {
    saving.value = true
    try {
      if (storyBibleStore.storyBible) {
        await storyBibleStore.updateStoryBible(projectId, form.value)
      }
      else {
        await storyBibleStore.createStoryBible(projectId, form.value)
      }
      toast.add('故事设定集已保存', 'success')
    }
    catch {
      toast.add('保存失败，请稍后重试', 'error')
    }
    finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    activeSection,
    form,
    isBrainstorming,
    aiSuggestion,
    aiError,
    handleAIBrainstorm,
    handleApplyAI,
    dismissAISuggestion,
    handleSave,
    projectStore,
    storyBibleStore,
  }
}
