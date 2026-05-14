import type { AuthoringEventSource, AuthoringEventType } from '@ai-novel/shared'

export function useAuthoringEventLogger(projectId: string) {
  const logEvent = async (params: {
    eventType: AuthoringEventType
    source: AuthoringEventSource
    chapterId?: string | null
    sceneId?: string | null
    payload?: any
  }) => {
    try {
      await fetch('/api/authoring-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          ...params,
        }),
      })
    }
    catch (err) {
      console.error('Failed to log authoring event:', err)
    }
  }

  return {
    logEvent,
  }
}
