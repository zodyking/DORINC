/** Re-export AI rule card helpers for TypeScript consumers. */
export {
  createAiRuleCard,
  parseAiRuleCards,
  serializeAiRuleCards,
  formatAiRulesForPrompt,
} from './ai-rules.mjs'

export interface AiRuleCard {
  id: string
  title: string
  rule: string
}
