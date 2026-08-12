/**
 * Shared pg_dump / pg_restore helpers for Nuxt API and workers.
 *
 * Backups intentionally dump the whole `public` schema (custom format).
 * REQUIRED_BACKUP_TABLES is the app table checklist — keep it in sync with
 * `server/db/schema` (unit test enforces this).
 */

/** @type {readonly string[]} */
export const REQUIRED_BACKUP_TABLES = Object.freeze([
  // auth / access
  'account_types',
  'permissions',
  'account_type_permissions',
  'users',
  'user_permission_overrides',
  'sessions',
  'email_verification_tokens',
  'password_reset_tokens',
  'access_events',
  'outside_geo_challenges',
  'rate_limit_events',
  'suspicious_activity_alerts',

  // core business
  'customers',
  'customer_contacts',
  'customer_credential_email_logs',
  'vehicles',
  'service_logs',
  'invoices',
  'invoice_line_items',
  'invoice_files',
  'estimates',
  'estimate_line_items',
  'estimate_files',
  'catalog_categories',
  'catalog_items',
  'catalog_packages',
  'catalog_package_items',
  'catalog_labor_rates',
  'app_files',
  'invoice_templates',
  'invoice_template_versions',
  'app_settings',
  'editing_sessions',
  'entity_deletion_requests',

  // portal / requests
  'new_vehicle_requests',
  'service_requests',
  'invoice_change_requests',
  'vehicle_change_requests',
  'portal_general_requests',
  'document_change_requests',

  // messaging / email
  'conversations',
  'conversation_participants',
  'messages',
  'message_entity_refs',
  'email_threads',
  'email_message_meta',
  'email_conversation_reads',
  'imap_sync_state',
  'email_ingest_suppressions',
  'email_templates',

  // AI / jobs / pdf
  'ai_provider_settings',
  'ai_jobs',
  'ai_suggestions',
  'ai_usage_logs',
  'worker_jobs',
  'pdf_render_jobs',

  // announcements / billing
  'announcements',
  'announcement_targets',
  'announcement_acknowledgements',
  'billing_integrations',

  // ops
  'audit_logs',
  'db_size_snapshots',
  'backup_integrations',
  'backup_settings',
  'backup_runs',
  'backup_recovery_tests',
])

/**
 * @param {{ host: string, port: string, user: string, database: string }} conn
 * @returns {string[]}
 */
export function buildPgDumpArgs(conn) {
  return [
    '--format=custom',
    '--schema=public',
    '--blobs',
    '--no-owner',
    '--no-acl',
    '-h', conn.host,
    '-p', conn.port,
    '-U', conn.user,
    conn.database,
  ]
}

/**
 * @param {{ host: string, port: string, user: string, database: string }} conn
 * @param {string} dumpPath
 * @returns {string[]}
 */
export function buildPgRestoreArgs(conn, dumpPath) {
  return [
    '--clean',
    '--if-exists',
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    '-h', conn.host,
    '-p', conn.port,
    '-U', conn.user,
    '-d', conn.database,
    dumpPath,
  ]
}

/**
 * Parse table names from `pg_restore --list` TOC text.
 * @param {string} tocText
 * @returns {string[]}
 */
export function tablesFromPgRestoreList(tocText) {
  const tables = new Set()
  for (const line of String(tocText ?? '').split(/\r?\n/)) {
    // e.g. "1234; 0 0 TABLE DATA public users postgres"
    // e.g. "345; 1259 16396 TABLE public users postgres"
    const match = line.match(/\bTABLE(?:\s+DATA)?\s+public\s+([a-zA-Z0-9_]+)\b/)
    if (match?.[1]) tables.add(match[1])
  }
  return [...tables].sort()
}

/**
 * @param {string} tocText
 * @param {readonly string[]} [required]
 * @returns {{ present: string[], missing: string[] }}
 */
export function diffRequiredBackupTables(tocText, required = REQUIRED_BACKUP_TABLES) {
  const present = new Set(tablesFromPgRestoreList(tocText))
  const missing = required.filter(name => !present.has(name))
  return {
    present: [...present].sort(),
    missing,
  }
}
