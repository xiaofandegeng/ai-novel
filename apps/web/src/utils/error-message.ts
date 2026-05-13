/**
 * Centralized error message mapping.
 * Converts API/technical errors into user-facing Chinese copy.
 */

const ERROR_MESSAGES: Record<string, string> = {
  // Generic fallback
  unknown: '操作失败，请稍后重试',

  // Project
  project_load: '项目数据加载失败',
  project_save: '项目设置保存失败',
  project_create: '项目创建失败',
  project_update: '项目更新失败',
  project_delete: '删除失败',
  project_title_required: '项目名称不能为空',

  // AI
  ai_generate: 'AI 生成失败',
  ai_request: 'AI 请求失败',
  ai_response_empty: 'AI 响应为空',
  ai_config_load: 'AI 配置加载失败',
  ai_config_save: 'AI 配置保存失败',
  ai_config_test: 'AI 服务检测失败',
  ai_brainstorm: 'AI 灵感风暴失败',
  ai_analyze: 'AI 分析失败',
  ai_consistency: '一致性检查失败',

  // Outline
  outline_load: '大纲数据加载失败',
  outline_save: '大纲保存失败',
  chapter_add: '章节添加失败',
  volume_add: '分卷添加失败',

  // Character
  character_load: '加载角色数据失败，请稍后重试',
  character_add: '添加角色失败，请稍后重试',
  character_save: '保存失败，请稍后重试',
  character_delete: '删除失败，请稍后重试',
  character_select_required: '请先选择一个角色',

  // Relationship
  relationship_load: '加载关系数据失败，请稍后重试',
  relationship_add: '添加关系失败，请稍后重试',
  relationship_save: '保存失败，请稍后重试',
  relationship_delete: '删除失败，请稍后重试',
  relationship_min_characters: '至少需要 2 名角色才能创建关系',

  // Conflict
  conflict_load: '加载冲突数据失败，请稍后重试',
  conflict_add: '添加冲突失败，请稍后重试',
  conflict_save: '保存失败，请稍后重试',
  conflict_delete: '删除失败，请稍后重试',

  // Foreshadowing
  foreshadowing_load: '加载伏笔台账失败',
  foreshadowing_create: '创建失败',
  foreshadowing_update: '更新失败',
  foreshadowing_delete: '删除失败',

  // Writing job
  job_load: '加载写作任务失败',
  job_create: '创建失败',
  job_start: '启动失败',
  job_pause: '暂停失败',
  job_delete: '删除失败',
  job_confirm: '确认失败',
  job_reject: '驳回失败',
  job_retry: '重试失败',

  // Story bible
  bible_save: '故事设定集保存失败',

  // Knowledge
  file_read: '文件读取失败',

  // Export
  export: '导出失败',

  // Health
  health_fetch: '健康指标获取失败',

  // Persona
  persona_save: '写作人格配置保存失败',
  persona_preview: '预览失败',
  persona_select_required: '请先选择一个写作人格',
  persona_config_loading: 'AI 配置仍在加载，请稍后再保存',
}

export type ErrorCode = keyof typeof ERROR_MESSAGES

export function getErrorMessage(code: ErrorCode, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || ERROR_MESSAGES.unknown
}
