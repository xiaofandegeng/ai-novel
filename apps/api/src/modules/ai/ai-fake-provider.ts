import process from 'node:process'

export function isFakeAIEnabled(): boolean {
  return process.env.AI_FAKE_MODE === 'true' && process.env.NODE_ENV !== 'production'
}

export function fakeAIJSON(taskType: string): Record<string, unknown> {
  switch (taskType) {
    case 'generate_plan':
      return {
        title: '雾港来信',
        goals: '主角发现新的航线线索',
        conflicts: '是否相信匿名来信',
        events: '收到来信；核验印记；决定启程',
        emotionalArc: '警惕转为坚定',
        foreshadowing: '信封上的潮汐印记',
        endingHook: '码头出现一盏不应存在的灯',
        outline: '主角收到匿名来信，通过旧档案确认潮汐印记，最终决定前往雾港。',
        scenes: [{
          sceneNumber: 1,
          title: '匿名来信',
          location: '书房',
          purpose: '引出航线线索',
          summary: '主角核验来信并作出决定。',
          characters: [],
          conflict: '信任与怀疑',
          conflictLevel: 4,
          beatType: 'hook',
        }],
      }
    case 'generate_scene_plan':
      return {
        title: '匿名来信',
        goals: '核验来信',
        conflicts: '信任与怀疑',
        events: '拆信；比对印记；决定行动',
        emotionalArc: '警惕转为坚定',
        outline: '主角在书房拆开匿名来信，并从旧档案中确认印记。',
      }
    case 'validate_plan':
      return { status: 'pass', issues: [], suggestions: '结构清晰，可以继续。' }
    case 'generate_draft':
      return {
        title: '雾港来信',
        draft: '雨水敲打着窗。林岚拆开没有署名的信封，潮汐印记在灯下泛出微光。她翻出旧档案，确认这枚印记只属于已经封闭的雾港航线。天亮前，她收好地图，决定亲自去码头寻找真相。门外忽然传来三声轻响，走廊尽头却空无一人。',
        wordCount: 104,
      }
    case 'consistency_guard': {
      const dimension = { status: 'pass', score: 100, reason: '未发现冲突' }
      return {
        overallStatus: 'pass',
        score: 100,
        themeAlignment: dimension,
        plotContinuity: dimension,
        characterConsistency: dimension,
        worldRuleConsistency: dimension,
        foreshadowingConsistency: dimension,
        styleConsistency: dimension,
        risks: [],
        suggestedFixes: [],
      }
    }
    case 'extract_chapter_changes':
    case 'extract_scene_changes':
      return {
        summary: '主角收到匿名来信并决定前往雾港。',
        keyEvents: [{ title: '收到来信', description: '匿名线索指向雾港', importance: 'major' }],
        facts: [{
          subjectType: 'character',
          subjectName: '林岚',
          predicate: '决定前往',
          objectType: 'location',
          objectName: '雾港',
          confidence: 95,
          reason: '正文明确描述',
        }],
        foreshadowingAdded: [],
        foreshadowingPayoffs: [],
        characterStateChanges: [],
        relationshipChanges: '',
        relationshipUpdates: [],
        conflictProgress: '',
        conflictUpdates: [],
        themeProgress: '开始主动追寻真相',
        styleNotes: [],
        newCharacters: [],
        newConflicts: [],
        presentCharacters: [],
        events: [{ title: '收到来信', description: '匿名线索指向雾港', importance: 'major' }],
      }
    case 'evaluate_change_set':
      return { riskLevel: 'low', reason: '未发现一致性风险', detail: '可安全应用' }
    case 'auto_repair':
      return { repairedDraft: '', changes: [], report: '无需修复' }
    case 'auto_repair_plan':
      return { repairedPlan: {}, changes: [], report: '无需修复' }
    case 'auto_plan_scenes':
      return { scenes: [] }
    default:
      throw new Error(`Unsupported fake AI task type: ${taskType}`)
  }
}

export function fakeAIEmbedding(): number[] {
  return Array.from({ length: 1536 }, (_, index) => ((index % 4) + 1) / 4)
}
