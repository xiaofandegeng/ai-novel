import type { CharacterRole } from '@ai-novel/shared'

export const characterRoleOptions: Array<{ label: string, value: CharacterRole }> = [
  { label: '主角', value: 'protagonist' },
  { label: '反派', value: 'antagonist' },
  { label: '导师', value: 'mentor' },
  { label: '盟友', value: 'ally' },
  { label: '重要配角', value: 'supporting' },
  { label: '群众角色', value: 'extra' },
]

const characterRoleLabelMap = new Map<CharacterRole, string>(
  characterRoleOptions.map(option => [option.value, option.label]),
)

export function getCharacterRoleLabel(role?: CharacterRole | string | null) {
  if (!role)
    return '未定义身份'
  return characterRoleLabelMap.get(role as CharacterRole) || role
}
