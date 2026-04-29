export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatRequest {
  messages: AIMessage[]
  context?: string
  model?: string
}

export interface AIResultProposal {
  id: string
  type: 'outline' | 'draft' | 'suggestion'
  content: string
  createdAt: string
}
