/** Re-export service log extraction rule helpers for TypeScript consumers. */
export {
  DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS,
  DEFAULT_SERVICE_LOG_EXTRACTION_RULES,
  normalizeServiceLogExtractionRules,
  buildPageTypeSystemPrompt,
  buildPageTypeUserPrompt,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  mergeServiceLogPageExtractions,
  normalizePageType,
} from './service-log-extraction-rules.mjs'
