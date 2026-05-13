export function buildProjectBrainstormPrompt() {
  return `请根据当前的作品基本设定，为全书进行全局性的"大纲规划"。
     输出要求：
     1. 必须使用中文。
     2. 必须包含以下结构化模块，并用【】括起标题：
     【核心主题】：深入探讨全书的核心表达和哲学思考。
     【类型基调】：明确作品的市场定位、语言风格和情感底色。
     【全书大纲】：梳理作品的主要线索、高潮转折和最终结局。

     语气要宏大且具有启发性。`
}

export function buildVolumeBrainstormPrompt() {
  return `请根据全书设定和当前分卷信息，为本卷进行详细的"分卷规划"。
     输出要求：
     1. 必须使用中文。
     2. 必须包含以下结构化模块，并用【】括起标题：
     【核心任务】：本卷在全书结构中承载的主要功能。
     【分卷大纲】：本卷的具体起因、发展、高潮和收尾逻辑。

     要注重剧情的连贯性和矛盾的升级感。`
}

export function buildChapterBrainstormPrompt() {
  return `请根据当前故事设定、人物档案和前文剧情，为本章进行深度"灵感风暴"。
     输出要求：
     1. 必须使用中文。
     2. 必须包含以下结构化模块，并用【】括起标题：
     【创作目标】：本章在全书结构中的定位和必须达成的目的。
     【核心冲突】：本章最核心的对抗点（内部或外部）。
     【情感基调】：希望带给读者的情绪体验及转变。
     【剧情拆解】：详细的行动步骤（1. 2. 3. ...）。
     【结尾悬念】：如何留住读者，引向下一章。

     语气要专业、富有戏剧张力，字数约 300-500 字。`
}

export function buildSceneGenerationPrompt() {
  return `为当前章节规划场景列表。为每个场景提供：标题、地点、时间线、目的、冲突、出场角色、目标字数。
    返回 JSON 数组格式，每个元素包含 title, location, timeline, purpose, conflict, characters, targetWords 字段。`
}

export function parseOutlineSuggestion(text: string) {
  const extract = (key: string) => {
    const pattern = new RegExp(`【${key}】[:：\\s]*([\\s\\S]*?)(?=【|$)`, 'i')
    return text.match(pattern)?.[1]?.trim() || ''
  }

  const goals = extract('创作目标') || extract('本章目标') || extract('核心任务')
  const conflicts = extract('核心冲突')
  const emotionalArc = extract('情感基调') || extract('情绪基调') || extract('类型基调')
  const events = extract('剧情拆解') || extract('关键事件') || extract('情节拆解') || extract('分卷大纲') || extract('全书大纲')
  const endingHook = extract('结尾悬念') || extract('钩子')
  const theme = extract('核心主题')

  return { goals, conflicts, emotionalArc, events, endingHook, theme }
}

function extractSceneJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s?([\s\S]*?)```/i)
  const text = (fenced?.[1] || raw).trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start)
    throw new Error('未找到 JSON 数组')
  return JSON.parse(text.slice(start, end + 1))
}

export function parseSceneSuggestion(raw: string) {
  let parsed: unknown
  try {
    parsed = extractSceneJson(raw)
  }
  catch {
    return null
  }
  if (!Array.isArray(parsed))
    return null

  return parsed
    .map((item, index) => {
      const data = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const title = typeof data.title === 'string' ? data.title.trim() : ''
      const purpose = typeof data.purpose === 'string' ? data.purpose.trim() : ''
      if (!title && !purpose)
        return null
      const sceneNumber = index + 1
      return {
        sceneNumber,
        title: title || `场景 ${sceneNumber}`,
        location: typeof data.location === 'string' ? data.location : undefined,
        timeline: typeof data.timeline === 'string' ? data.timeline : undefined,
        purpose: purpose || undefined,
        conflict: typeof data.conflict === 'string' ? data.conflict : undefined,
        characters: typeof data.characters === 'string'
          ? data.characters
          : Array.isArray(data.characters)
            ? data.characters.filter(v => typeof v === 'string').join('、')
            : undefined,
        targetWords: typeof data.targetWords === 'number'
          ? data.targetWords
          : typeof data.targetWords === 'string'
            ? Number(data.targetWords) || undefined
            : undefined,
        orderIndex: sceneNumber,
        status: 'planned' as const,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
}
