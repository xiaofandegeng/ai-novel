export type WritingGoalType = 'daily_words' | 'weekly_words' | 'chapters' | 'completion_date'
export type WritingGoalStatus = 'active' | 'completed' | 'abandoned'

export interface WritingGoal {
  id: string
  projectId: string
  goalType: WritingGoalType
  targetWords: number | null
  targetChapters: number | null
  startDate: string
  endDate: string | null
  status: WritingGoalStatus
  createdAt: string
  updatedAt: string
}

export interface CreateWritingGoalInput {
  goalType: WritingGoalType
  targetWords?: number
  targetChapters?: number
  startDate: string
  endDate?: string
  status?: WritingGoalStatus
}

export interface UpdateWritingGoalInput {
  goalType?: WritingGoalType
  targetWords?: number | null
  targetChapters?: number | null
  startDate?: string
  endDate?: string | null
  status?: WritingGoalStatus
}

export interface DailyWritingStats {
  id: string
  projectId: string
  date: string
  wordsAdded: number
  chaptersCompleted: number
  aiWordsAccepted: number
  manualWordsAdded: number
  createdAt: string
}

export interface WritingGoalProgress {
  goal: WritingGoal
  currentWords: number
  currentChapters: number
  percentage: number
  daysRemaining: number
  dailyTarget: number
}
