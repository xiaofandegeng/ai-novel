import type { BuiltAIContext } from '@ai-novel/shared'

export function renderAIContext(context: BuiltAIContext): string {
  const sections: string[] = []

  sections.push(`【本次任务】\n场景: ${context.scene}\n指令: ${context.task}`)

  sections.push(`【作品档案】\n书名: ${context.project.title}\n类型: ${context.project.genre || '未定义'}\n主题: ${context.project.theme || '未定义'}\n简介: ${context.project.description || '未定义'}`)

  if (context.storyBible) {
    sections.push(`【故事设定】\n世界观: ${context.storyBible.worldview || '未定义'}\n主冲突: ${context.storyBible.mainConflict || '未定义'}\n规则: ${context.storyBible.rules || '未定义'}`)
  }

  if (context.currentVolume) {
    sections.push(`【当前分卷】\n标题: ${context.currentVolume.title}\n分卷大纲: ${context.currentVolume.summary || '未定义'}`)
  }

  if (context.currentChapter) {
    const chapterLines = [
      `标题: ${context.currentChapter.title}`,
      context.currentChapter.volumeTitle ? `所属分卷: ${context.currentChapter.volumeTitle}` : null,
      `章节目标: ${context.currentChapter.goals || '未定义'}`,
      `核心冲突: ${context.currentChapter.conflicts || '未定义'}`,
      context.currentChapter.events ? `关键事件: ${context.currentChapter.events}` : null,
      context.currentChapter.emotionalArc ? `情绪曲线: ${context.currentChapter.emotionalArc}` : null,
      context.currentChapter.foreshadowing ? `伏笔: ${context.currentChapter.foreshadowing}` : null,
      context.currentChapter.endingHook ? `结尾钩子: ${context.currentChapter.endingHook}` : null,
      context.currentChapter.draftExcerpt ? `草稿片段:\n${context.currentChapter.draftExcerpt}` : '草稿片段: 暂无草稿',
    ].filter(Boolean)

    sections.push(`【当前章节】\n${chapterLines.join('\n')}`)
  }

  if (context.currentScene) {
    const sceneLines = [
      `场景 ${context.currentScene.sceneNumber}: ${context.currentScene.title || '未命名'}`,
      context.currentScene.location ? `地点: ${context.currentScene.location}` : null,
      context.currentScene.timeline ? `时间线: ${context.currentScene.timeline}` : null,
      context.currentScene.purpose ? `目的: ${context.currentScene.purpose}` : null,
      context.currentScene.summary ? `摘要: ${context.currentScene.summary}` : null,
      context.currentScene.characters ? `出场角色: ${context.currentScene.characters}` : null,
      context.currentScene.conflict ? `场景冲突: ${context.currentScene.conflict}` : null,
      context.currentScene.targetWords ? `目标字数: ${context.currentScene.targetWords}` : null,
    ].filter(Boolean)
    sections.push(`【当前场景】\n${sceneLines.join('\n')}`)
  }

  if (context.chapterScenes && context.chapterScenes.length > 0) {
    const sceneList = context.chapterScenes
      .map(s => `- 场景 ${s.sceneNumber}: ${s.title || '未命名'} [${s.status}] - ${s.summary || '无摘要'}`)
      .join('\n')
    sections.push(`【场景列表】\n${sceneList}`)
  }

  if (context.nearbyChapters?.previous || context.nearbyChapters?.next) {
    sections.push(`【前后章节】\n上一章: ${context.nearbyChapters.previous ? `${context.nearbyChapters.previous.chapterNumber}. ${context.nearbyChapters.previous.title} - ${context.nearbyChapters.previous.summary || '无摘要'}` : '无'}\n下一章: ${context.nearbyChapters.next ? `${context.nearbyChapters.next.chapterNumber}. ${context.nearbyChapters.next.title} - ${context.nearbyChapters.next.summary || '无摘要'}` : '无'}`)
  }

  if (context.characters.length > 0) {
    const charList = context.characters.map((c) => {
      const details = [
        `身份: ${c.role || '无身份'}`,
        `性格: ${c.personality || '无性格描述'}`,
        c.goal ? `目标: ${c.goal}` : null,
        c.desire ? `欲望: ${c.desire}` : null,
        c.fear ? `恐惧: ${c.fear}` : null,
        c.secret ? `秘密: ${c.secret}` : null,
        c.weakness ? `弱点: ${c.weakness}` : null,
        c.arc ? `成长线: ${c.arc}` : null,
      ].filter(Boolean)

      const prefix = c.isMajor ? '★ ' : '- '
      const suffix = c.isMajor ? ' (本章核心角色，必须重点描写其行动与心理)' : ''
      return `${prefix}${c.name}${suffix}\n  ${details.join('\n  ')}`
    }).join('\n')

    sections.push(`【登场人物】\n${charList}`)
  }

  if (context.relationships.length > 0) {
    const relList = context.relationships
      .map(r => `- ${r.characterAName} 与 ${r.characterBName}: ${r.type} / 强度 ${r.strength} / ${r.status || '未定义'}。${r.description || ''}`)
      .join('\n')
    sections.push(`【人物关系】\n${relList}`)
  }

  if (context.conflicts.length > 0) {
    const conflictList = context.conflicts
      .map((c) => {
        const participants = c.participantNames?.join('、') || c.participants || '未定义'
        return `- ${c.title}: ${c.type} / 强度 ${c.intensity} / 状态 ${c.status}。参与者: ${participants}。${c.description || ''}`
      })
      .join('\n')
    sections.push(`【核心矛盾】\n${conflictList}`)
  }

  if (context.knowledgeSnippets.length > 0) {
    const knowledgeList = context.knowledgeSnippets
      .map(k => `- ${k.title}\n  摘要: ${k.summary}\n  技巧: ${k.techniques || '无'}`)
      .join('\n')
    sections.push(`【参考技巧库】\n${knowledgeList}\n\n注意：只能借鉴抽象技巧和结构经验，不得复刻参考作品桥段、专名或连续表达。`)
  }

  if (context.personaMemory.length > 0) {
    sections.push(`【项目写作记忆】\n以下是从已完成章节沉淀出的抽象风格和节奏偏好，只能作为高层写法约束：\n${context.personaMemory.join('\n')}\n\n注意：这是本项目自己的写作记忆，不得把它当作剧情事实覆盖故事设定。`)
  }

  if (context.chapterMemories.length > 0) {
    sections.push(`【前序章节记忆】\n以下是最近章节的结构化记忆，请确保连贯性：\n${context.chapterMemories.join('\n\n')}`)
  }

  if (context.chapterElements.length > 0) {
    sections.push(`【本章元素】\n${context.chapterElements.join('\n')}\n注意：必须让标记为 appears 的角色实际出场，必须让 scene 地点成为本章场景。`)
  }

  if (context.foreshadowingItems.length > 0) {
    const foreshadowingList = context.foreshadowingItems
      .map((i) => {
        const chars = i.characterNames?.join('、') || '无'
        return `- ${i.title} (${i.status}/${i.importance}) 相关角色:${chars}${i.description ? `: ${i.description}` : ''}`
      })
      .join('\n')
    sections.push(`【伏笔台账】\n${foreshadowingList}\n约束：不得无故回收未到时机的伏笔。如果新增重大伏笔，必须在章后管线登记。`)
  }

  if (context.factTriples.length > 0) {
    sections.push(`【事实图谱】\n${context.factTriples.join('\n')}\n注意：必须遵守已确认的事实，不得与既有设定矛盾。`)
  }

  if (context.persona) {
    sections.push(`【写作人格: ${context.persona.name} (强度: ${context.persona.strength})】\n${context.persona.prompt}`)
  }

  if (context.constraints.length > 0) {
    sections.push(`【输出约束】\n${context.constraints.map(c => `- ${c}`).join('\n')}`)
  }

  return sections.join('\n\n---\n\n')
}
