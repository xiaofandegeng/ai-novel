/**
 * Centralized toast message constants.
 * All user-facing toast strings are maintained here.
 */

// Success
export const T = {
  // Project
  project_created: '项目已创建',
  project_updated: '项目已更新',
  project_deleted: '项目已删除',
  project_saved: '项目设置已保存',
  project_reset: '已恢复为当前项目配置',

  // AI
  ai_config_saved: 'AI 配置已保存',
  ai_config_passed: 'AI 服务检测通过',

  // Persona
  persona_saved: '写作人格配置已保存',

  // Outline
  outline_saved: '大纲已保存',
  chapter_added: '章节已添加',
  volume_added: '分卷已添加',
  ai_inserted: 'AI 建议已插入关键事件',
  ai_replaced: 'AI 建议已替换关键事件',
  ai_backup: 'AI 建议已保存为备选',
  ai_discarded: 'AI 建议已丢弃',
  alt_inserted: '备选方案已插入关键事件',
  alt_replaced: '备选方案已替换关键事件',
  alt_removed: '备选方案已移除',

  // Character
  character_added: '角色已添加',
  character_updated: '角色已更新',
  character_deleted: '角色已删除',

  // Relationship
  relationship_added: '关系已添加',
  relationship_saved: '关系已保存',
  relationship_deleted: '关系已删除',

  // Conflict
  conflict_added: '冲突已添加',
  conflict_updated: '冲突已更新',
  conflict_deleted: '冲突已删除',

  // Foreshadowing
  foreshadowing_created: '伏笔已创建',
  foreshadowing_updated: '伏笔已更新',
  foreshadowing_deleted: '伏笔已删除',

  // Writing job
  job_created: '写作任务已创建',
  job_started: '任务已启动',
  job_paused: '任务已暂停',
  job_deleted: '任务已删除',
  job_confirmed: '已确认，继续执行',
  job_rejected: '已驳回',
  job_retrying: '正在重试...',

  // Story bible
  bible_created: '故事设定集已创建',
  bible_updated: '故事设定集已更新',

  // Volume / Chapter (devtools)
  volume_created: '分卷已创建',
  volume_deleted: '分卷已删除',
  chapter_created: '章节已创建',
  chapter_deleted: '章节已删除',

  // Writing
  ai_applied: 'AI 修改已应用到草稿',
  ai_saved_backup: '已保存为备份版本',
} as const

// Warning messages
export const W = {
  ai_config_test_failed: 'AI 服务检测未通过',
  persona_select_required: '请先选择一个写作人格',
  ai_config_loading: 'AI 配置仍在加载，请稍后再保存',
  relationship_min: '至少需要 2 名角色才能创建关系',
  character_select_required: '请先选择一个角色',
  project_title_required: '请输入项目标题',
} as const
