import { eq } from 'drizzle-orm'
import { db } from '../db'
import { acts, storyStructureTemplates, volumes } from '../db/schema'
import { generateId } from '../utils'

interface BuiltinTemplate {
  name: string
  description: string
  structureType: 'three_act' | 'five_act' | 'hero_journey'
  genre: string
  actsJson: ActDef[]
  chapterCountEstimate: number
}

interface ActDef {
  title: string
  description: string
  theme: string
  targetChapterCount: number
  keyEvents: string[]
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: '三幕式',
    description: '经典三幕结构：建置、对抗、解决。适用于大多数小说类型。',
    structureType: 'three_act',
    genre: '通用',
    chapterCountEstimate: 30,
    actsJson: [
      { title: '第一幕：建置', description: '建立世界观、引入主角和核心冲突', theme: '铺垫', targetChapterCount: 10, keyEvents: ['开场钩子', '触发事件', '第一转折'] },
      { title: '第二幕：对抗', description: '冲突升级、主角成长、面临考验', theme: '发展', targetChapterCount: 14, keyEvents: ['中间转折', '危机爆发', '至暗时刻'] },
      { title: '第三幕：解决', description: '最终对决、高潮、收尾', theme: '高潮', targetChapterCount: 6, keyEvents: ['高潮对决', '反转揭示', '结局'] },
    ],
  },
  {
    name: '五幕式',
    description: '更细致的五幕结构，适合长篇连载。',
    structureType: 'five_act',
    genre: '通用',
    chapterCountEstimate: 50,
    actsJson: [
      { title: '第一幕：开端', description: '世界观和人物登场', theme: '铺垫', targetChapterCount: 8, keyEvents: ['世界观建立', '主角登场'] },
      { title: '第二幕：发展', description: '冲突展开和人物成长', theme: '上升', targetChapterCount: 12, keyEvents: ['冲突初现', '盟友结成'] },
      { title: '第三幕：转折', description: '局势急转、危机加剧', theme: '转折', targetChapterCount: 10, keyEvents: ['重大转折', '背叛或牺牲'] },
      { title: '第四幕：危机', description: '至暗时刻和最终准备', theme: '危机', targetChapterCount: 10, keyEvents: ['至暗时刻', '觉醒力量'] },
      { title: '第五幕：高潮', description: '最终对决和收尾', theme: '解决', targetChapterCount: 10, keyEvents: ['最终对决', '真相揭示', '新秩序'] },
    ],
  },
  {
    name: '英雄之旅',
    description: '基于坎贝尔英雄旅程的经典叙事模板。',
    structureType: 'hero_journey',
    genre: '奇幻/冒险',
    chapterCountEstimate: 40,
    actsJson: [
      { title: '启程', description: '平凡世界、冒险召唤、跨越门槛', theme: '启程', targetChapterCount: 10, keyEvents: ['平凡世界', '冒险召唤', '拒绝召唤', '导师出现', '跨越门槛'] },
      { title: '启蒙', description: '考验、盟友与敌人、接近最深处洞穴', theme: '考验', targetChapterCount: 15, keyEvents: ['考验之路', '盟友结成', '敌人现身', '接近深渊'] },
      { title: '归来', description: '磨难、奖赏、回归之路、复活、携万灵药归来', theme: '归来', targetChapterCount: 15, keyEvents: ['终极考验', '获得奖赏', '回归之路', '最终复活', '携万灵药归来'] },
    ],
  },
]

export async function seedBuiltinTemplates() {
  for (const tpl of BUILTIN_TEMPLATES) {
    const existing = await db.select().from(storyStructureTemplates).where(eq(storyStructureTemplates.name, tpl.name))
    if (existing.length === 0) {
      await db.insert(storyStructureTemplates).values({
        id: generateId(),
        name: tpl.name,
        description: tpl.description,
        genre: tpl.genre,
        structureType: tpl.structureType,
        actsJson: JSON.stringify(tpl.actsJson),
        chapterCountEstimate: tpl.chapterCountEstimate,
        isBuiltin: 1,
      })
    }
  }
}

export async function listTemplates(genre?: string) {
  if (genre)
    return db.select().from(storyStructureTemplates).where(eq(storyStructureTemplates.genre, genre))
  return db.select().from(storyStructureTemplates)
}

export async function applyTemplate(projectId: string, templateId: string) {
  const [tpl] = await db.select().from(storyStructureTemplates).where(eq(storyStructureTemplates.id, templateId))
  if (!tpl)
    throw new Error('模板不存在')

  const actDefs: ActDef[] = tpl.actsJson ? JSON.parse(tpl.actsJson) : []

  // Ensure a default volume exists
  const existingVolumes = await db.select().from(volumes).where(eq(volumes.projectId, projectId))
  let volumeId = existingVolumes[0]?.id
  if (!volumeId) {
    const [vol] = await db.insert(volumes).values({
      id: generateId(),
      projectId,
      title: '第一卷',
      orderIndex: 1,
    }).returning()
    volumeId = vol.id
  }

  const created = []
  for (let i = 0; i < actDefs.length; i++) {
    const actDef = actDefs[i]
    const [act] = await db.insert(acts).values({
      id: generateId(),
      projectId,
      volumeId,
      title: actDef.title,
      description: actDef.description,
      theme: actDef.theme,
      keyEvents: JSON.stringify(actDef.keyEvents),
      targetChapterCount: actDef.targetChapterCount,
      orderIndex: i + 1,
    }).returning()
    created.push(act)
  }

  return created
}
