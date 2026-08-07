/** Control Panel accordion catalog — single source for order, Title Case labels, jump nav. */

export type ControlPanelSectionId
  = | 'business'
    | 'invoice'
    | 'catalog'
    | 'line-detection'
    | 'chat'
    | 'notifications'
    | 'email'
    | 'billing'
    | 'ai'
    | 'import'
    | 'backup'
    | 'security'

export interface ControlPanelSectionDef {
  id: ControlPanelSectionId
  title: string
  icon: string
  subtitle: string
}

export interface ControlPanelGroupDef {
  id: string
  label: string
  sections: ControlPanelSectionDef[]
}

/**
 * Logical operator order:
 * Workspace settings → communications → platform / ops.
 */
export const CONTROL_PANEL_GROUPS: ControlPanelGroupDef[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    sections: [
      {
        id: 'business',
        title: 'Business',
        icon: '🏢',
        subtitle: 'Shop name, contact, and address',
      },
      {
        id: 'invoice',
        title: 'Invoices',
        icon: '🧾',
        subtitle: 'Payment terms and approval thresholds',
      },
      {
        id: 'catalog',
        title: 'Catalog Detection',
        icon: '📦',
        subtitle: 'Category keyword rules',
      },
      {
        id: 'line-detection',
        title: 'Line Detection',
        icon: '🔤',
        subtitle: 'Part, labor, and fee verb lists',
      },
      {
        id: 'chat',
        title: 'Chat',
        icon: '💬',
        subtitle: 'Team chat and direct messaging',
      },
      {
        id: 'notifications',
        title: 'Notifications',
        icon: '🔔',
        subtitle: 'App-wide email alert toggles',
      },
    ],
  },
  {
    id: 'communications',
    label: 'Communications',
    sections: [
      {
        id: 'email',
        title: 'Email',
        icon: '✉️',
        subtitle: 'Outbound SMTP, inbound IMAP, and test delivery',
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    sections: [
      {
        id: 'billing',
        title: 'Billing Integrations',
        icon: '💳',
        subtitle: 'Vultr, Cloudflare, and Susan (OpenRouter) credentials',
      },
      {
        id: 'ai',
        title: 'Susan',
        icon: '✦',
        subtitle: 'Per-task models, caps, and usage',
      },
      {
        id: 'import',
        title: 'Import / Export',
        icon: '⇅',
        subtitle: 'Bulk data exchange',
      },
      {
        id: 'backup',
        title: 'Backup & Restore',
        icon: '☁️',
        subtitle: 'Encrypted archives · optional Google Drive',
      },
      {
        id: 'security',
        title: 'Security',
        icon: '🔒',
        subtitle: 'Access gate, alerts, and worker queue',
      },
    ],
  },
]

export const CONTROL_PANEL_SECTION_IDS: ControlPanelSectionId[]
  = CONTROL_PANEL_GROUPS.flatMap(group => group.sections.map(section => section.id))

export function controlPanelSectionById(id: ControlPanelSectionId): ControlPanelSectionDef | undefined {
  for (const group of CONTROL_PANEL_GROUPS) {
    const hit = group.sections.find(section => section.id === id)
    if (hit) return hit
  }
  return undefined
}

/** Empty open-state map for all catalog sections. */
export function emptyControlPanelOpenState(): Record<ControlPanelSectionId, boolean> {
  return Object.fromEntries(
    CONTROL_PANEL_SECTION_IDS.map(id => [id, false]),
  ) as Record<ControlPanelSectionId, boolean>
}
