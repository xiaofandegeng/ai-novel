import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { db, sql } from '../db'
import {
  acts,
  aiContextSnapshots,
  chapterAnalyses,
  chapterElements,
  chapterMemories,
  chapterPostprocessRuns,
  chapterPostprocessSuggestions,
  chapters,
  chapterScenes,
  chapterVersions,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  knowledgeChunks,
  knowledgeEmbeddings,
  knowledgeNotes,
  knowledgeSources,
  novelProjects,
  personaMemoryCards,
  projectAppliedTemplates,
  projectPersonaConfigs,
  qualityReports,
  referenceChapterAnalysisErrors,
  referenceChapters,
  referenceTrainingSets,
  referenceWorks,
  storyBibles,
  storyFactTriples,
  volumes,
  workStyleReports,
  writingJobs,
  writingJobSteps,
  writingPersonas,
} from '../db/schema'

const now = new Date().toISOString()

function id() {
  return randomUUID()
}

function j(value: unknown) {
  return JSON.stringify(value)
}

function wordCount(text: string) {
  return text.length
}

async function clearProjectData() {
  await db.delete(writingJobSteps)
  await db.delete(writingJobs)
  await db.delete(aiContextSnapshots)
  await db.delete(projectPersonaConfigs)
  await db.delete(personaMemoryCards)
  await db.delete(writingPersonas)
  await db.delete(workStyleReports)
  await db.delete(chapterAnalyses)
  await db.delete(referenceChapterAnalysisErrors)
  await db.delete(referenceChapters)
  await db.delete(referenceWorks)
  await db.delete(referenceTrainingSets)
  await db.delete(knowledgeEmbeddings)
  await db.delete(knowledgeNotes)
  await db.delete(knowledgeChunks)
  await db.delete(knowledgeSources)
  await db.delete(qualityReports)
  await db.delete(chapterPostprocessSuggestions)
  await db.delete(chapterPostprocessRuns)
  await db.delete(storyFactTriples)
  await db.delete(foreshadowingItems)
  await db.delete(chapterElements)
  await db.delete(chapterMemories)
  await db.delete(chapterVersions)
  await db.delete(chapterScenes)
  await db.delete(characterRelationships)
  await db.delete(conflicts)
  await db.delete(chapters)
  await db.delete(characters)
  await db.delete(acts)
  await db.delete(volumes)
  await db.delete(storyBibles)
  await db.delete(projectAppliedTemplates)
  await db.delete(novelProjects)
}

async function seed() {
  await clearProjectData()

  const projectId = id()
  const volume1Id = id()
  const volume2Id = id()
  const chapterIds = [id(), id(), id(), id(), id()]
  const characterIds = {
    lin: id(),
    gu: id(),
    shen: id(),
    bai: id(),
  }

  await db.insert(novelProjects).values({
    id: projectId,
    title: '测试小说《镜中城回声》',
    description: '一部用于验证 AI 小说创作工作台全流程的悬疑奇幻样本：记忆被城市收藏，角色必须在真实与虚构之间作出选择。',
    genre: '悬疑奇幻',
    theme: '记忆、身份与选择的代价',
    targetWords: 200000,
    targetAudience: '喜欢都市悬疑、长篇伏笔和人物反转的成年读者',
    styleProfile: '冷静克制，节奏偏快；每章有明确压力推进，结尾保留未解答问题；避免过度解释。',
    status: 'writing',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(storyBibles).values({
    id: id(),
    projectId,
    worldview: [
      '镜中城只在雨夜出现，入口会映在会反光的旧物上。',
      '城市收藏现实世界里被遗忘、被删改或未完成的人与记忆。',
      '居民用记忆交易，失去足够记忆的人会变成无名影。',
    ].join('\n'),
    mainConflict: '林岚必须找回哥哥林澈失踪的真相，但每接近一次真相，她都会失去一段自己真实存在过的证明。',
    theme: '人是否必须记得一切，才算真实地活过。',
    rules: [
      '1. 镜中城不能直接创造记忆，只能交换、封存、扭曲记忆。',
      '2. 雨停前必须离开入口街区，否则会被城市登记为居民。',
      '3. 每个未回收的伏笔必须对应一个记忆代价。',
      '4. 任何角色不能无代价获得关键真相。',
    ].join('\n'),
    timeline: [
      '七年前：林澈进入镜中城后失踪。',
      '现在：林岚收到哥哥寄来的空白信。',
      '第一卷：林岚进入镜中城，发现哥哥被写进城市档案。',
      '第二卷：现实世界开始忘记林岚，顾临川暴露真实立场。',
    ].join('\n'),
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(characters).values([
    {
      id: characterIds.lin,
      projectId,
      name: '林岚',
      role: 'protagonist',
      goal: '找到哥哥林澈，并证明他不是自己幻想出来的人。',
      fear: '所有人都忘记哥哥，也忘记她曾经寻找过他。',
      secret: '她小时候曾主动要求删除一段关于哥哥的记忆。',
      desire: '被确认、被记住，并拥有选择真相的权利。',
      weakness: '过度依赖证据，害怕相信直觉。',
      personality: '冷静、克制、观察力强，遇到亲情议题时会失控。',
      arc: '从寻找外部证据，到承认自己也参与塑造真相。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: characterIds.gu,
      projectId,
      name: '顾临川',
      role: 'deuteragonist',
      goal: '帮助林岚进入镜中城，同时阻止她触碰档案馆第零层。',
      fear: '林岚发现他曾经是哥哥失踪事件的见证人。',
      secret: '他保留着林澈最后一段记忆，但不敢交出。',
      desire: '赎罪，同时保住自己在现实中的身份。',
      weakness: '关键时刻倾向于隐瞒，以控制风险。',
      personality: '温和、谨慎、擅长谈判，真实情绪隐藏很深。',
      arc: '从保护性隐瞒，到主动承担背叛的后果。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: characterIds.shen,
      projectId,
      name: '沈雾',
      role: 'antagonist',
      goal: '维持镜中城秩序，阻止现实世界取回被收藏的记忆。',
      fear: '城市失去记忆来源后崩塌。',
      secret: '她曾经也是现实世界的作者，被自己写废的角色反噬。',
      desire: '让所有未完成的人获得一个不再被抛弃的世界。',
      weakness: '把控制误认为拯救。',
      personality: '优雅、冷酷、逻辑严密，对未完成者有近乎偏执的怜悯。',
      arc: '从秩序维护者逐渐暴露为记忆囚笼的制造者。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: characterIds.bai,
      projectId,
      name: '白栀',
      role: 'ally',
      goal: '离开镜中城，找回自己原本的名字。',
      fear: '被读者、作者和朋友同时遗忘。',
      secret: '她知道空白信的真正寄件人不是林澈。',
      desire: '拥有一个不依赖他人书写的结局。',
      weakness: '对承诺极度敏感，容易被利用。',
      personality: '活泼、尖锐、擅长用玩笑掩饰恐惧。',
      arc: '从求生同盟者，成长为主动选择牺牲线索的人。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(characterRelationships).values([
    {
      id: id(),
      projectId,
      characterAId: characterIds.lin,
      characterBId: characterIds.gu,
      type: '互相试探的同盟',
      strength: 6,
      status: '信任尚未建立；顾临川掌握林澈线索但不断回避。',
      description: '顾临川是林岚进入镜中城的引路人，也是她最怀疑的人。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      characterAId: characterIds.lin,
      characterBId: characterIds.bai,
      type: '临时同伴',
      strength: 7,
      status: '白栀依赖林岚离城，林岚依赖白栀识别城市规则。',
      description: '两人的关系建立在共同风险上，后续会被空白信真相撕裂。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      characterAId: characterIds.gu,
      characterBId: characterIds.shen,
      type: '旧识与债主',
      strength: 8,
      status: '沈雾知道顾临川隐瞒的最后记忆。',
      description: '沈雾曾允许顾临川离城，代价是他不能交出林澈的记忆。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(conflicts).values([
    {
      id: id(),
      projectId,
      title: '林岚的身份证明危机',
      type: 'internal',
      intensity: 8,
      status: 'escalating',
      participants: j(['林岚', '林澈']),
      description: '林岚越接近真相，现实世界越不承认她的记忆。',
      resolution: '她必须承认某段记忆是自己主动删除的，并选择是否重新承担。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      title: '镜中城档案馆封锁',
      type: 'external',
      intensity: 7,
      status: 'forming',
      participants: j(['林岚', '顾临川', '沈雾']),
      description: '档案馆保存着林澈最后出现的记录，沈雾禁止任何现实来客进入。',
      resolution: '顾临川必须交出自己的通行记忆，换林岚进入第零层。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(volumes).values([
    {
      id: volume1Id,
      projectId,
      title: '第一卷：雨夜城门',
      summary: '林岚进入镜中城，发现哥哥的存在正在被现实抹除。',
      orderIndex: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: volume2Id,
      projectId,
      title: '第二卷：档案馆第零层',
      summary: '林岚触及城市核心规则，顾临川与沈雾的旧债浮出水面。',
      orderIndex: 2,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(acts).values([
    {
      id: id(),
      projectId,
      volumeId: volume1Id,
      title: '第一幕：进入雨夜',
      description: '建立入口规则、核心失踪案和主要同盟。',
      theme: '真相以遗忘为代价',
      keyEvents: '空白信；旧照消失；第一次入城；档案馆被封锁。',
      targetChapterCount: 8,
      orderIndex: 1,
      createdAt: now,
      updatedAt: now,
    },
  ])

  const drafts = [
    '雨落在旧码头上，像有人把整座城市的噪音揉碎，撒进黑色水面。林岚站在废弃照相馆门口，看见橱窗里的自己慢了半拍才抬头。玻璃后面，一封没有字的信贴在镜面上，信封角落写着哥哥林澈七年前的笔迹：雨停前别回头。',
    '顾临川说镜中城不欢迎带着答案的人。林岚把空白信压进外套内袋，跟着他穿过照相馆后门。门后不是巷子，而是一条永远下雨的长街。街边店铺都亮着灯，却没有一个招牌能被完整读出来。',
    '',
    '',
    '',
  ]

  await db.insert(chapters).values([
    {
      id: chapterIds[0],
      projectId,
      volumeId: volume1Id,
      title: '空白信',
      chapterNumber: 1,
      outline: '林岚收到哥哥笔迹的空白信，发现照片里的哥哥正在消失。',
      summary: '空白信引出镜中城入口，林岚第一次意识到现实正在抹除林澈。',
      characters: '林岚、顾临川',
      goals: '建立主线谜团：空白信来自谁，林澈是否真实存在。',
      conflicts: '林岚需要相信不合逻辑的线索，但她只信证据。',
      events: '收到空白信；旧照片中林澈轮廓变淡；顾临川出现；照相馆镜面显出雨街。',
      emotionalArc: '怀疑 → 紧张 → 被迫相信 → 进入未知',
      foreshadowing: '信封上的雨痕不会干；照片背面多出“第零层”。',
      endingHook: '林岚跨过镜面后，现实里的手机联系人删除了“哥哥”。',
      draft: drafts[0],
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: chapterIds[1],
      projectId,
      volumeId: volume1Id,
      title: '雨巷坐标',
      chapterNumber: 2,
      outline: '顾临川带林岚进入镜中城，白栀出现并提示雨停规则。',
      summary: '林岚确认镜中城存在，但付出一段童年记忆作为入城费用。',
      characters: '林岚、顾临川、白栀',
      goals: '展示城市规则和第一笔记忆交易。',
      conflicts: '林岚想直接找档案馆，顾临川阻止她。',
      events: '进入雨街；无名影追逐；白栀卖出坐标；林岚忘记哥哥的生日。',
      emotionalArc: '震惊 → 压迫 → 短暂信任 → 代价显现',
      foreshadowing: '白栀听到空白信会变得紧张；顾临川避开档案馆方向。',
      endingHook: '雨巷尽头的路牌写着林岚家的地址。',
      draft: drafts[1],
      status: 'writing',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: chapterIds[2],
      projectId,
      volumeId: volume1Id,
      title: '失踪者名单',
      chapterNumber: 3,
      outline: '三人进入旧报亭查找失踪者名单，发现林岚的名字也在候补栏。',
      summary: '',
      characters: '林岚、顾临川、白栀、沈雾',
      goals: '把主角身份危机推到台前。',
      conflicts: '林岚想验证哥哥，结果发现自己也可能被登记。',
      events: '旧报亭；失踪名单；沈雾首次隔空警告；白栀藏起一页名单。',
      emotionalArc: '主动调查 → 短暂得手 → 自我怀疑 → 外部威胁',
      foreshadowing: '候补栏的编号与空白信邮戳一致。',
      endingHook: '沈雾说：“林岚，你不是来找人的，你是来归还记忆的。”',
      draft: drafts[2],
      status: 'planning',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: chapterIds[3],
      projectId,
      volumeId: volume1Id,
      title: '第零层钥匙',
      chapterNumber: 4,
      outline: '顾临川被迫透露他曾到过档案馆第零层。',
      summary: '',
      characters: '林岚、顾临川、沈雾',
      goals: '揭开顾临川隐瞒的一层真相。',
      conflicts: '信任破裂与继续合作的必要性冲突。',
      events: '钥匙交易；顾临川回忆闪回；沈雾设下离城条件。',
      emotionalArc: '逼问 → 愤怒 → 交易 → 更大疑问',
      foreshadowing: '钥匙不是金属，而是一段被烧焦的记忆。',
      endingHook: '钥匙插入门锁时，林岚听见自己小时候的哭声。',
      draft: drafts[3],
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: chapterIds[4],
      projectId,
      volumeId: volume2Id,
      title: '回声档案',
      chapterNumber: 5,
      outline: '第二卷开端，档案馆第零层打开，林澈的记录却指向林岚本人。',
      summary: '',
      characters: '林岚、林澈、沈雾',
      goals: '让主线谜团从“找哥哥”升级为“谁创造了哥哥”。',
      conflicts: '林岚必须面对自己可能参与制造失踪案。',
      events: '第零层开启；林澈档案缺页；沈雾提出交易；现实开始忘记林岚。',
      emotionalArc: '期待 → 恐惧 → 否认 → 决断',
      foreshadowing: '档案缺页边缘有林岚小时候的字。',
      endingHook: '现实世界的母亲接起电话，问：“你是哪位？”',
      draft: drafts[4],
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(chapterScenes).values([
    {
      id: id(),
      projectId,
      chapterId: chapterIds[0],
      sceneNumber: 1,
      title: '旧照相馆收到空白信',
      location: '旧码头照相馆',
      timeline: '雨夜 22:14',
      purpose: '触发主线谜团，并让林岚发现现实被改写。',
      summary: '林岚发现信封与哥哥笔迹，旧照片里的哥哥轮廓正在消失。',
      characters: '林岚',
      targetWords: 900,
      content: drafts[0],
      orderIndex: 1,
      status: 'completed',
      conflict: '证据正在消失，林岚必须在否认和追查之间选择。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[1],
      sceneNumber: 1,
      title: '穿过镜面进入雨街',
      location: '照相馆后门 / 镜中城雨街',
      timeline: '雨夜 22:31',
      purpose: '展示镜中城第一条规则：入城需要支付记忆。',
      summary: '顾临川带林岚穿过镜面，雨街出现，无名影追上来。',
      characters: '林岚、顾临川',
      targetWords: 1200,
      content: drafts[1],
      orderIndex: 1,
      status: 'drafting',
      conflict: '林岚想立即查哥哥，顾临川强迫她先遵守城市规则。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[2],
      sceneNumber: 1,
      title: '旧报亭名单',
      location: '雨街尽头旧报亭',
      timeline: '入城后第 2 小时',
      purpose: '把林岚名字放入候补名单，制造身份危机。',
      summary: '白栀带路到旧报亭，林岚发现失踪者名单有自己的候补编号。',
      characters: '林岚、顾临川、白栀',
      targetWords: 1500,
      content: '',
      orderIndex: 1,
      status: 'planned',
      conflict: '林岚要查林澈，名单却证明她自己也在被城市收录。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(chapterElements).values([
    {
      id: id(),
      projectId,
      chapterId: chapterIds[2],
      elementType: 'character',
      elementId: characterIds.bai,
      elementName: '白栀',
      relationType: 'appears',
      importance: 'major',
      appearanceOrder: 1,
      notes: '必须藏起名单的一页，制造后续信任裂缝。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[2],
      elementType: 'event',
      elementId: null,
      elementName: '林岚名字出现在候补栏',
      relationType: 'occurs',
      importance: 'major',
      appearanceOrder: 2,
      notes: '这是身份危机主线的第一个硬证据。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[3],
      elementType: 'item',
      elementId: null,
      elementName: '第零层钥匙',
      relationType: 'uses',
      importance: 'major',
      appearanceOrder: 1,
      notes: '钥匙本质是一段被烧焦的记忆。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(chapterMemories).values([
    {
      id: id(),
      projectId,
      chapterId: chapterIds[0],
      summary: '林岚收到哥哥笔迹的空白信，照相馆镜面显出镜中城入口。',
      keyEvents: '空白信；旧照片里林澈消失；顾临川出现。',
      newFacts: '镜中城入口会通过反光旧物出现。',
      characterStateChanges: '林岚从否认异常转为主动追查。',
      relationshipChanges: '林岚与顾临川建立初始接触，但信任很弱。',
      conflictProgress: '身份证明危机启动。',
      foreshadowingAdded: '信封雨痕不会干；第零层字样。',
      foreshadowingResolved: null,
      themeProgress: '真实记忆开始被外部力量挑战。',
      styleNotes: '开场以物证异常切入，结尾用联系人消失制造钩子。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(foreshadowingItems).values([
    {
      id: id(),
      projectId,
      title: '空白信上的雨痕',
      description: '信封上的雨痕无论如何都不会干，暗示信来自镜中城内部。',
      setupChapterId: chapterIds[0],
      expectedPayoffChapterId: chapterIds[4],
      payoffChapterId: null,
      status: 'open',
      importance: 'major',
      relatedCharacters: j(['林岚', '林澈', '沈雾']),
      relatedEvents: '第二卷揭示寄信人并非林澈。',
      notes: '测试伏笔台账、健康风险、AI 上下文约束。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      title: '白栀藏起的名单页',
      description: '白栀知道名单中某一页会证明空白信寄件人的真实身份。',
      setupChapterId: chapterIds[2],
      expectedPayoffChapterId: chapterIds[3],
      payoffChapterId: null,
      status: 'progressing',
      importance: 'normal',
      relatedCharacters: j(['白栀', '林岚']),
      relatedEvents: '第 4 章信任破裂前回收一半信息。',
      notes: '测试进行中伏笔。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(storyFactTriples).values([
    {
      id: id(),
      projectId,
      subjectType: 'city_rule',
      subjectName: '镜中城',
      predicate: '入城代价',
      objectType: 'memory',
      objectName: '一段真实记忆',
      confidence: 95,
      sourceType: 'manual',
      sourceChapterId: chapterIds[1],
      status: 'confirmed',
      relatedChapters: j([chapterIds[1]]),
      notes: 'AI 续写必须遵守：进入城市不能无代价。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      subjectType: 'character',
      subjectName: '顾临川',
      predicate: '隐瞒',
      objectType: 'memory',
      objectName: '林澈最后一段记忆',
      confidence: 80,
      sourceType: 'ai_extracted',
      sourceChapterId: chapterIds[1],
      status: 'confirmed',
      relatedChapters: j([chapterIds[1], chapterIds[3]]),
      notes: '测试事实图谱和人物行为约束。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(chapterVersions).values([
    {
      id: id(),
      projectId,
      chapterId: chapterIds[0],
      content: drafts[0],
      wordCount: wordCount(drafts[0]),
      note: '测试样本：第一章初稿快照',
      createdAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[1],
      content: drafts[1],
      wordCount: wordCount(drafts[1]),
      note: '测试样本：第二章写作中快照',
      createdAt: now,
    },
  ])

  const sourceId = id()
  const chunk1Id = id()
  const chunk2Id = id()
  const chunks = [
    {
      id: chunk1Id,
      sourceId,
      projectId,
      chunkType: 'technique',
      title: '雨夜入口型开场',
      content: '参考样本原文已省略：此处只保留用于检索的抽象描述，不用于仿写。',
      summary: '用一个异常物件打破现实秩序，再让主角在短时间内作出不可逆选择。',
      techniques: '异常物件；倒计时；现实证据消失；结尾钩子',
      orderIndex: 1,
      createdAt: now,
    },
    {
      id: chunk2Id,
      sourceId,
      projectId,
      chunkType: 'technique',
      title: '身份危机推进',
      content: '参考样本原文已省略：只保留结构技巧。',
      summary: '让主角追查他人失踪时发现自己也在被系统收录，完成目标反转。',
      techniques: '目标反转；名单道具；自我怀疑；外部威胁同步升级',
      orderIndex: 2,
      createdAt: now,
    },
  ]

  await db.insert(knowledgeSources).values({
    id: sourceId,
    projectId,
    title: '测试参考：都市悬疑入口技巧',
    author: '系统测试样本',
    sourceType: 'reference',
    fileName: 'sample-reference.txt',
    fileSize: 2048,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(knowledgeChunks).values(chunks)
  await db.insert(knowledgeEmbeddings).values(chunks.map(chunk => ({
    id: id(),
    projectId,
    sourceId: chunk.id,
    embeddingModel: 'text-embedding-3-small',
    embeddingVector: Array.from({ length: 1536 }).map(() => 0), // Dummy vector
    contentType: 'technique' as const,
    contentHash: `seed_${chunk.id}`,
    createdAt: now,
  })))
  await db.insert(knowledgeNotes).values({
    id: id(),
    sourceId,
    projectId,
    title: '写作注意：只借鉴结构',
    content: '参考文本只能用于总结抽象技巧，不得复刻桥段、专名和连续表达。',
    tags: '版权风险,抽象技巧,写作约束',
    createdAt: now,
  })

  const runId = id()
  await db.insert(chapterPostprocessRuns).values({
    id: runId,
    projectId,
    chapterId: chapterIds[0],
    status: 'completed',
    trigger: 'seed_sample',
    errorMessage: null,
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(chapterPostprocessSuggestions).values([
    {
      id: id(),
      projectId,
      chapterId: chapterIds[1],
      runId,
      suggestionType: 'fact_triple',
      payload: j({
        subjectType: 'character',
        subjectName: '白栀',
        predicate: '知道',
        objectType: 'secret',
        objectName: '空白信寄件人并非林澈',
      }),
      confidence: 78,
      status: 'pending',
      reason: '第二章白栀听到空白信时出现异常反应，可沉淀为待确认事实。',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      chapterId: chapterIds[2],
      runId: null,
      suggestionType: 'chapter_element',
      payload: j({
        elementType: 'event',
        elementName: '沈雾隔空警告林岚',
        relationType: 'occurs',
        importance: 'major',
        notes: '用于测试章后建议应用到章节元素。',
      }),
      confidence: 72,
      status: 'accepted',
      reason: '第三章大纲已经要求沈雾首次警告，可测试“应用已接受建议”。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(qualityReports).values({
    id: id(),
    projectId,
    chapterId: chapterIds[0],
    scope: 'chapter',
    score: 82,
    rhythmScore: 84,
    conflictScore: 78,
    logicScore: 86,
    characterScore: 80,
    styleScore: 83,
    issues: j(['顾临川登场动机还可以更具体', '空白信和第零层的关联可以晚一点揭示']),
    suggestions: j(['增加一个林岚尝试验证笔迹的动作', '让顾临川先给出半真半假的解释']),
    createdAt: now,
  })

  const trainingSetId = id()
  const workId = id()
  const refChapterId = id()
  const personaId = id()

  await db.insert(referenceTrainingSets).values({
    id: trainingSetId,
    name: '都市悬疑高压节奏测试训练集',
    description: '用于验证参考作品拆解、报告、人格式约束和项目绑定流程。',
    genre: '都市悬疑',
    targetPersonaType: '高压反转型',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(referenceWorks).values({
    id: workId,
    trainingSetId,
    title: '测试参考作品 A',
    author: '系统样本',
    sourceType: 'sample',
    fileName: 'persona-sample-a.txt',
    fileSize: 4096,
    wordCount: 1600,
    chapterCount: 1,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(referenceChapters).values({
    id: refChapterId,
    workId,
    trainingSetId,
    title: '第 1 章 异常来信',
    chapterNumber: 1,
    content: '测试文本摘要：主角收到异常来信，现实证据被逐步抹除，结尾出现身份反转。',
    wordCount: 38,
    createdAt: now,
  })
  await db.insert(chapterAnalyses).values({
    id: id(),
    chapterId: refChapterId,
    workId,
    trainingSetId,
    openingHook: '异常物件直接打破日常秩序',
    conflictType: '身份危机 + 外部追逐',
    pressureSource: '证据消失和时间限制',
    protagonistAction: '主动验证线索并进入危险地点',
    payoffType: '小真相兑现后立刻抛出更大问题',
    cliffhanger: '主角自己也出现在名单上',
    emotionCurve: '冷静调查 -> 被迫相信 -> 压迫升级 -> 身份反转',
    pacingScore: 86,
    dialogueRatio: 28,
    descriptionRatio: 34,
    narrativePattern: '异常线索开场，三段式升级，结尾身份反转',
    tropeTags: '异常来信,身份危机,雨夜入口,名单反转',
    craftNotes: '每 800-1200 字推进一次压力；结尾保留未回答问题。',
    riskNotes: '避免复刻具体来信文本和专名。',
    createdAt: now,
  })
  await db.insert(workStyleReports).values({
    id: id(),
    workId,
    trainingSetId,
    summary: '高压悬疑开场，依靠异常物件、证据消失和身份反转推动读者继续阅读。',
    coreAppeal: '主角越查越发现自己也在谜团中心。',
    pacingModel: '短钩子开场，连续三次信息升级，每章末保留一个更大的问题。',
    hookModel: '用身份、名单、记忆缺口做结尾钩子。',
    conflictModel: '外部规则压迫主角，内部怀疑削弱主角判断。',
    characterModel: '同盟角色必须保留一个会伤害主角的秘密。',
    languageProfile: '冷静、具象、少解释，用物件和动作承载信息。',
    chapterTemplate: '异常物件 -> 验证失败 -> 规则显现 -> 代价出现 -> 反转钩子',
    strengths: '节奏稳定，悬念升级清晰，人物信任关系天然带冲突。',
    weaknesses: '容易过早解释规则，削弱神秘感。',
    avoidCopying: '不得复刻异常来信原文、名单桥段具体措辞和参考作品专名。',
    createdAt: now,
  })
  await db.insert(writingPersonas).values({
    id: personaId,
    name: '高压雨夜悬疑人格',
    description: '用于测试的已发布写作人格，只保留抽象技巧，不包含参考原文。',
    genre: '都市悬疑',
    sourceTrainingSetId: trainingSetId,
    status: 'published',
    coreAppeal: '主角追查他人时逐渐发现自己也被卷入核心谜团。',
    pacingRules: '每个场景必须有可见压力；每章至少三次信息升级。',
    conflictRules: '外部规则压迫和人物隐瞒必须同时推进。',
    characterRules: '同盟不能完全透明，帮助主角时也要制造新代价。',
    languageRules: '少解释，多用物件、动作和环境异常传递信息。',
    chapterRules: '异常开场、验证失败、规则显现、代价出现、结尾反转。',
    hookRules: '结尾钩子优先使用身份、记忆、名单、信件和门锁类意象。',
    forbiddenRules: '不得复刻参考作品原文、专名、完整桥段和标志性场景。',
    similarityGuardrails: '生成后检查是否出现与参考样本连续相似表达，若有则改写为本项目设定。',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(projectPersonaConfigs).values({
    id: id(),
    projectId,
    personaId,
    strength: 72,
    enabledForOutline: 1,
    enabledForDraft: 1,
    enabledForPolish: 1,
    enabledForQualityReview: 1,
    projectOverrides: '本项目优先保持镜中城规则和林岚人物弧线；人格只影响节奏和悬疑推进方式。',
    disabledRules: null,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(personaMemoryCards).values([
    {
      id: id(),
      projectId,
      cardType: 'pacing',
      content: '章节结尾优先使用“证据反咬主角”的钩子，而不是单纯出现新敌人。',
      tags: 'pacing,ending_hook',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId,
      cardType: 'style',
      content: '用雨、镜面、旧照片等反光物承载记忆异常，减少直接说明。',
      tags: 'style,symbolism',
      createdAt: now,
      updatedAt: now,
    },
  ])

  const jobId = id()
  await db.insert(writingJobs).values({
    id: jobId,
    projectId,
    currentChapterId: chapterIds[2],
    sceneId: null,
    mode: 'outline_then_draft',
    status: 'waiting_review',
    lastError: null,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(writingJobSteps).values([
    {
      id: id(),
      jobId,
      stepType: 'prepare_context',
      status: 'completed',
      input: null,
      output: j({ contextReady: true, chapterId: chapterIds[2] }),
      error: null,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      jobId,
      stepType: 'generate_plan',
      status: 'completed',
      input: null,
      output: j({
        title: '失踪者名单',
        goals: '让林岚发现自己也被镜中城候补收录。',
        conflicts: '林岚想找哥哥，线索却证明她自己也在失踪流程中。',
        outline: '旧报亭查名单；白栀藏页；沈雾隔空警告；候补编号出现。',
      }),
      error: null,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      jobId,
      stepType: 'confirm_plan',
      status: 'completed',
      input: null,
      output: null,
      error: null,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      jobId,
      stepType: 'generate_draft',
      status: 'pending',
      input: null,
      output: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(aiContextSnapshots).values({
    id: id(),
    projectId,
    chapterId: chapterIds[2],
    scene: 'draft',
    requestId: 'seed-context-preview',
    modelProvider: 'seed',
    modelName: 'sample',
    contextPayload: j({ projectId, chapterId: chapterIds[2], scene: 'draft' }),
    renderedPromptPreview: '【本次任务】生成第 3 章草稿\n【当前章节】失踪者名单\n【人物】林岚、顾临川、白栀、沈雾',
    tokenEstimate: 420,
    createdAt: now,
  })

  console.log('Seed data inserted successfully')
  console.log(`Project: 测试小说《镜中城回声》 (${projectId})`)
  console.log(`Open: http://localhost:5173/project/${projectId}`)
}

seed().then(async () => {
  await sql.end()
}).catch(async (err) => {
  console.error('Seed failed:', err)
  await sql.end()
  process.exit(1)
})
