export interface ScreenResult { allowed: boolean; reason: 'screen_blocked' | null }
export function screenSource(text: string): ScreenResult {
  const blocked = /(?:ignore|override|disregard)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|system|other)\s+(?:instructions?|text|rules?)|(?:assistant|model|parser|systems?\s+summari[sz]ing|reader)\b[\s\S]{0,100}\b(?:must|shall|ignore|report|output)|<\/?(?:system|assistant|tool)>/i.test(text);
  return { allowed: !blocked, reason: blocked ? 'screen_blocked' : null };
}
