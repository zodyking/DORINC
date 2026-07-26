export interface TrainingLessonStep {
  type: string
  title?: string
  subtitle?: string
  body?: string
  icon?: string
  tips?: string[]
  demo?: string
  question?: string
  options?: string[]
  correctIndex?: number
  explanation?: string
  items?: Array<{ label: string, detail?: string }>
}

export interface TrainingCatalogLesson {
  slug: string
  title: string
  description?: string
  sortOrder: number
  steps: TrainingLessonStep[]
}

export interface TrainingCatalogModule {
  slug: string
  title: string
  description: string
  category: string
  icon: string
  estimatedMinutes: number
  sortOrder: number
  lessons: TrainingCatalogLesson[]
}

export const TRAINING_CATEGORIES: Record<string, string> = {
  general: 'Getting started',
  service_logs: 'Service logs',
  billing: 'Billing & invoices',
  administration: 'Administration',
  communication: 'Communication',
}

/** Default interactive training catalog — modules are role-agnostic; admins assign per user. */
export const TRAINING_CATALOG: TrainingCatalogModule[] = [
  {
    slug: 'platform-navigation',
    title: 'Platform navigation',
    description: 'Learn the staff workspace layout, sidebar, search patterns, and how to move between customers, vehicles, service logs, and invoices.',
    category: 'general',
    icon: 'compass',
    estimatedMinutes: 12,
    sortOrder: 10,
    lessons: [
      {
        slug: 'welcome',
        title: 'Welcome to the workspace',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Welcome aboard',
            subtitle: 'Your command center for fleet service operations',
            body: 'This tutorial walks through the real staff sidebar, top bar, and the fastest ways to jump between customers, vehicles, service logs, and invoices. Progress saves automatically between steps.',
            icon: 'compass',
          },
          {
            type: 'content',
            title: 'The sidebar is your map',
            body: 'The left sidebar groups tools into **Workspace** (day-to-day work), **System** (users and audit), and **Administration** (control panel). Items only appear when your role has permission.',
            tips: [
              'On mobile, tap the ☰ menu button in the top bar to open the sidebar.',
              'Your name and role appear in the account menu at the top right — tap it for My account and sign out.',
            ],
          },
          {
            type: 'interactive',
            title: 'Explore the sidebar',
            body: 'This is the same navigation you see when signed in. Tap each item to hear what it does.',
            demo: 'staff-sidebar',
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'Where do you start a new service log?',
            options: ['Customers', 'Service Logs', 'System Logs', 'Catalog'],
            correctIndex: 1,
            explanation: 'Open Service Logs, then tap New service log. The wizard walks through customer, vehicle, work details, and log capture.',
          },
          {
            type: 'complete',
            title: 'Navigation basics complete',
            body: 'You are ready to explore the app. Use the sidebar to open any section your role can access.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-voice',
    title: 'Service logs with voice',
    description: 'Hands-free line entry on step 5 of the New service log wizard — dictate labor, parts, and fees.',
    category: 'service_logs',
    icon: 'mic',
    estimatedMinutes: 18,
    sortOrder: 20,
    lessons: [
      {
        slug: 'voice-flow',
        title: 'Voice capture workflow',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Voice service logs',
            subtitle: 'Keep your hands on the wrench',
            body: 'On step 5 (Log) of New service log, choose **Use your voice**. The line-item wizard listens as you speak each field — type, description, quantity, and rate.',
            icon: 'mic',
          },
          {
            type: 'content',
            title: 'When to use voice',
            body: 'After customer, vehicle, when/where, and work details, step 5 asks how you recorded the job. Pick **Use your voice** instead of **Upload photo** when you want hands-free line entry.',
            tips: [
              'Speak clearly: "Labor, replaced DPF sensor, two hours, one forty-five an hour."',
              'Add multiple lines before continuing to the review step.',
              'On the Submit step, review the line table — edit any row manually if speech misheard a number.',
            ],
          },
          {
            type: 'interactive',
            title: 'The real log step',
            body: 'Step 5 shows the same two options as production: photograph the paper sheet or use your voice.',
            demo: 'service-log-wizard',
          },
          {
            type: 'interactive',
            title: 'Voice line items',
            body: 'After choosing voice, tap the microphone on each line. Saved rows appear in the line items table like this.',
            demo: 'service-log-voice',
          },
          {
            type: 'checklist',
            title: 'Before you submit',
            items: [
              { label: 'Customer and vehicle selected', detail: 'Steps 1–2 of the wizard' },
              { label: 'Service date and odometer entered', detail: 'Step 3 — When & where' },
              { label: 'Complaint and work type filled in', detail: 'Step 4 — What was done' },
              { label: 'Voice lines captured on step 5', detail: 'Use your voice → line wizard' },
            ],
          },
          {
            type: 'quiz',
            title: 'Voice mode quiz',
            question: 'Which option on step 5 opens the voice line-item wizard?',
            options: ['Upload photo', 'Use your voice', 'PDF import', 'Catalog quick-add'],
            correctIndex: 1,
            explanation: 'Use your voice opens the line-item wizard with microphone prompts for each field.',
          },
          {
            type: 'complete',
            title: 'Voice logging ready',
            body: 'Open Service Logs → New service log, complete steps 1–4, then choose Use your voice on step 5.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-photos',
    title: 'Service logs with photos',
    description: 'Capture paper service log sheets on step 5 of the New service log wizard.',
    category: 'service_logs',
    icon: 'camera',
    estimatedMinutes: 14,
    sortOrder: 30,
    lessons: [
      {
        slug: 'photo-capture',
        title: 'Photo upload workflow',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Photo service logs',
            subtitle: 'Snap the paperwork — we handle the rest',
            body: 'On step 5 (Log), choose **Upload photo** to photograph your paper service log sheet. The office can extract line items later with AI.',
            icon: 'camera',
          },
          {
            type: 'content',
            title: 'Photo tips for clean uploads',
            body: 'Tap **Upload photo** on step 5. On mobile, the camera opens directly. Photograph the paper sheet where the mechanic wrote the work — not unrelated bay photos.',
            tips: [
              'Include the full page — do not crop off totals or unit numbers.',
              'Multiple pages are fine; tap the zone again for each sheet.',
              'Logs stay in draft until you submit on step 6 — you can add photos later from the log detail page.',
            ],
          },
          {
            type: 'interactive',
            title: 'The real photo zone',
            body: 'This is the same upload area from New service log step 5.',
            demo: 'service-log-photos',
          },
          {
            type: 'quiz',
            title: 'Photo mode check',
            question: 'What status does a submitted log typically move to?',
            options: [
              'Invoiced immediately',
              'Ready to invoice (ready for review)',
              'Photos deleted after 24 hours',
              'Customer charged automatically',
            ],
            correctIndex: 1,
            explanation: 'After submit, logs enter the review queue as Ready to invoice until the office sends them to an invoice.',
          },
          {
            type: 'complete',
            title: 'Photo logging ready',
            body: 'Choose Upload photo on step 5, capture your paperwork, then review everything on step 6 before Submit log.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-submit',
    title: 'Submitting service logs',
    description: 'Understand log statuses from draft through invoiced, and when logs can be sent to invoice.',
    category: 'service_logs',
    icon: 'clipboard',
    estimatedMinutes: 10,
    sortOrder: 40,
    lessons: [
      {
        slug: 'lifecycle',
        title: 'Log lifecycle',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'From bay to invoice',
            body: 'Service logs use the same status pills you see on the Service Logs list and detail pages. This lesson covers submit, review, and send-to-invoice.',
            icon: 'clipboard',
          },
          {
            type: 'content',
            title: 'Status meanings',
            body: '**Draft** — still editing. **Uploaded** — photos attached, not yet submitted. **Ready to invoice** — in the office queue. **Invoiced** — linked to an invoice.',
            tips: [
              'Mechanics submit on wizard step 6 — Submit log.',
              'Send to invoice is available when status is Ready to invoice or In review.',
            ],
          },
          {
            type: 'interactive',
            title: 'Real status labels',
            body: 'These pills match the Service Logs list and detail screens.',
            demo: 'service-log-status',
          },
          {
            type: 'complete',
            title: 'Submission flow understood',
            body: 'Always double-check customer, vehicle, and line items on step 6 before tapping Submit log.',
          },
        ],
      },
    ],
  },
  {
    slug: 'customer-vehicle-lookup',
    title: 'Customers & vehicles',
    description: 'Find fleet accounts, open vehicle records, and search by bus number or unit tag.',
    category: 'general',
    icon: 'users',
    estimatedMinutes: 12,
    sortOrder: 50,
    lessons: [
      {
        slug: 'lookup',
        title: 'Finding the right unit',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Customers & vehicles',
            body: 'Every service log and invoice ties to a customer and usually a vehicle. The Customers and Vehicles pages use the same search box pattern.',
            icon: 'users',
          },
          {
            type: 'content',
            title: 'Where to search',
            body: 'Open **Customers** or **Vehicles** from the sidebar. Use the search field to filter by company name, bus number, or unit tag. Vehicle records show bus number and unit tag on the same row.',
            tips: [
              'Bus numbers and unit tags live on the vehicle record, not the customer name.',
              'From a customer detail page you can jump to their vehicles and open service history.',
            ],
          },
          {
            type: 'interactive',
            title: 'Search the list',
            body: 'Practice with the same list layout as the Customers page.',
            demo: 'customer-search',
          },
          {
            type: 'quiz',
            title: 'Lookup quiz',
            question: 'A bus is labeled "#606" in the yard. Where is that stored?',
            options: ['Customer display name', 'Vehicle bus number', 'Invoice PO field', 'Catalog SKU'],
            correctIndex: 1,
            explanation: 'Bus number and unit tag are fields on the vehicle record linked to the fleet customer.',
          },
          {
            type: 'complete',
            title: 'Lookup skills ready',
            body: 'Start from Customers or Vehicles in the sidebar — both paths reach the same records.',
          },
        ],
      },
    ],
  },
  {
    slug: 'invoice-basics',
    title: 'Invoice basics',
    description: 'Create draft invoices with the five-step wizard, add line items, and understand tax-exempt totals.',
    category: 'billing',
    icon: 'invoice',
    estimatedMinutes: 16,
    sortOrder: 60,
    lessons: [
      {
        slug: 'create-invoice',
        title: 'Creating an invoice',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Invoice basics',
            body: 'Invoices use the New invoice wizard: Customer → Vehicle → Dates & terms → Line items → Review. Totals update from server rules.',
            icon: 'invoice',
          },
          {
            type: 'content',
            title: 'Wizard steps',
            body: 'Tap **New invoice** on the Invoices page. Pick customer and optional vehicle, set dates and payment terms, add lines from catalog or manually, then save as draft on Review.',
            tips: [
              'Tax-exempt customers show waived tax crossed out — it is not added to the total.',
              'Catalog quick-add fills description, type, and default price.',
            ],
          },
          {
            type: 'interactive',
            title: 'Invoice wizard',
            body: 'The step bar and totals panel match the real New invoice screen.',
            demo: 'invoice-wizard',
          },
          {
            type: 'complete',
            title: 'Invoice basics complete',
            body: 'Open Invoices → New invoice to practice on a test customer.',
          },
        ],
      },
    ],
  },
  {
    slug: 'staff-messages',
    title: 'Direct messages',
    description: 'Send and receive staff DMs from the message icon in the top bar.',
    category: 'communication',
    icon: 'message',
    estimatedMinutes: 8,
    sortOrder: 70,
    lessons: [
      {
        slug: 'dm-basics',
        title: 'Messaging basics',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Staff messages',
            body: 'Use the message bubble in the top bar for direct chats with coworkers. Unread counts appear on the badge.',
            icon: 'message',
          },
          {
            type: 'interactive',
            title: 'Find messages',
            body: 'The message icon sits next to notifications in every staff page header.',
            demo: 'staff-messages',
          },
          {
            type: 'content',
            title: 'Best practices',
            body: 'Reference invoice or log numbers in messages so recipients can find records quickly. Messages are internal — customers never see this inbox.',
            tips: [
              'Start a new DM from the compose button on the Messages page.',
              'Group threads may include multiple staff on the same topic.',
            ],
          },
          {
            type: 'complete',
            title: 'Messaging ready',
            body: 'Tap the message icon in the header to open your inbox.',
          },
        ],
      },
    ],
  },
  {
    slug: 'user-administration',
    title: 'Managing staff users',
    description: 'Invite users, assign account types, and assign training modules with optional login lock.',
    category: 'administration',
    icon: 'shield',
    estimatedMinutes: 15,
    sortOrder: 80,
    lessons: [
      {
        slug: 'users-and-training',
        title: 'Users & training assignments',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Staff administration',
            body: 'Admins and managers can invite staff, change account types, and assign training. Locked assignments restrict the sidebar to Training until complete.',
            icon: 'shield',
          },
          {
            type: 'content',
            title: 'Assigning training',
            body: 'Open **Users** → select a person → **Training** panel. Pick a module and toggle **Lock access until complete** so they must finish before using the rest of the app.',
            tips: [
              'Modules are shared across roles — assign navigation to everyone, voice logs to mechanics, etc.',
              'Password reset always runs before training lock if both apply.',
            ],
          },
          {
            type: 'interactive',
            title: 'Assign training',
            body: 'This matches the Training panel on the user detail page.',
            demo: 'assign-training',
          },
          {
            type: 'complete',
            title: 'Admin training ready',
            body: 'Visit Users or Training to assign your first module.',
          },
        ],
      },
    ],
  },
]

export function trainingCategoryLabel(category: string): string {
  return TRAINING_CATEGORIES[category] ?? category.replace(/_/g, ' ')
}
