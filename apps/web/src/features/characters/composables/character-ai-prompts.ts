import type { CharForm } from './character-ai-helpers'
import { getCharacterRoleLabel } from '@/utils/character-labels'

export function buildCharacterAnalysisPrompt(charForm: CharForm) {
  return `请基于当前项目的故事设定、已有大纲、人物关系和该角色资料，分析并补全当前角色。

当前角色：
- 姓名：${charForm.name || '未命名'}
- 身份定位：${getCharacterRoleLabel(charForm.role)}
- 性格概括：${charForm.personality || '暂无'}
- 当前目标：${charForm.goal || '暂无'}

请只返回 JSON，不要 Markdown，不要解释，不要让作者继续选择：
{
  "summary": "一句话说明本次补全方向",
  "fields": {
    "personality": "可直接写入性格概括的内容",
    "goal": "可直接写入当前目标的内容",
    "desire": "可直接写入核心欲望的内容",
    "fear": "可直接写入核心恐惧的内容",
    "secret": "可直接写入灰暗秘密的内容",
    "weakness": "可直接写入性格软肋的内容",
    "arc": "可直接写入成长曲线的内容"
  }
}`
}

export function buildNewCharacterPrompt(existingNames: string[]) {
  return `请结合当前项目的世界观、主线矛盾、已有角色、章节走向和人物关系，推荐一个能推动剧情的新角色。

已有角色：${existingNames.length > 0 ? existingNames.join('、') : '暂无'}

要求：
1. 新角色必须服务于当前剧情，不要凭空加入无关设定。
2. 新角色要带来新的冲突、信息差、诱惑或阻碍。
3. 不要和已有角色功能重复。
4. 只返回 JSON，不要 Markdown，不要解释。

返回格式：
{
  "summary": "为什么这个角色适合加入当前故事",
  "character": {
    "name": "角色姓名",
    "role": "protagonist | antagonist | mentor | ally | supporting | extra",
    "personality": "性格概括",
    "goal": "当前目标",
    "desire": "核心欲望",
    "fear": "核心恐惧",
    "secret": "灰暗秘密",
    "weakness": "性格软肋",
    "arc": "成长曲线",
    "relations": [
      {
        "targetName": "必须填写已有角色姓名",
        "type": "ally | enemy | lover | family | mentor | rival | acquaintance",
        "strength": 1,
        "status": "当前互动状态",
        "description": "这段关系为什么存在，以及它如何推动剧情"
      }
    ]
  }
}`
}

export function buildMinorCharactersPrompt(existingNames: string[]) {
  return `请结合当前项目的世界观、主线矛盾、已有角色、章节走向和人物关系，批量推荐 5 个无关紧要但好用的小角色。

已有角色：${existingNames.length > 0 ? existingNames.join('、') : '暂无'}

小角色定义：
1. 不是主角团、反派核心、导师或关键盟友。
2. 可以是店主、守卫、档案员、邻居、目击者、信使、路人、临时雇员、失踪者家属等。
3. 每个角色只需要一个清晰功能：提供线索、制造误会、拦路、传递风声、展示世界规则、烘托氛围。
4. 不要和已有角色重名，不要引入会抢走主线的新设定。
5. 只返回 JSON，不要 Markdown，不要解释。

返回格式：
{
  "summary": "这批小角色适合补充在哪类剧情场景中",
  "characters": [
    {
      "name": "角色姓名",
      "role": "extra",
      "personality": "一句话性格或识别特征",
      "goal": "本角色在剧情中的即时目的",
      "desire": "简单欲望",
      "fear": "简单恐惧",
      "secret": "可选的小秘密或可利用信息",
      "weakness": "可被剧情利用的弱点",
      "arc": "登场用途与退场方式",
      "relations": [
        {
          "targetName": "必须填写已有角色姓名",
          "type": "acquaintance | ally | enemy | rival",
          "strength": 1,
          "status": "小角色和目标角色当前的交集",
          "description": "小角色给目标角色带来的线索、阻碍或氛围功能"
        }
      ]
    }
  ]
}`
}
