export interface TrainingLessonStep {
  type: string
  title?: string
  subtitle?: string
  body?: string
  icon?: string
  tips?: string[]
  demo?: string
  practiceId?: string
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
    description: 'Learn the staff workspace layout and practice opening Service Logs, Invoices, and Customers from the sidebar.',
    category: 'general',
    icon: 'compass',
    estimatedMinutes: 15,
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
            body: 'This module walks through the real staff sidebar and has you practice tapping the right destinations. Each step unlocks Continue only after you complete the task.',
            icon: 'compass',
          },
          {
            type: 'content',
            title: 'The sidebar is your map',
            body: 'The left sidebar groups tools into **Workspace** (day-to-day work), **System** (users and audit), and **Administration** (control panel). Items only appear when your role has permission.',
            tips: [
              'On mobile, tap the ☰ menu button in the top bar to open the sidebar.',
              'Your name and role appear in the account menu at the top right.',
            ],
          },
          {
            type: 'practice',
            title: 'Open Service Logs',
            body: 'Service logs are where mechanics record work on a unit. Find **Service Logs** in the sidebar and tap it.',
            practiceId: 'nav-service-logs',
          },
          {
            type: 'practice',
            title: 'Open Invoices',
            body: 'Billing lives under **Invoices**. Tap it in the sidebar.',
            practiceId: 'nav-invoices',
          },
          {
            type: 'practice',
            title: 'Open Customers',
            body: 'Fleet accounts and vehicle records start from **Customers**. Tap it in the sidebar.',
            practiceId: 'nav-customers',
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
            body: 'You practiced the three most common sidebar destinations. Use them to jump between customers, logs, and invoices.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-voice',
    title: 'Service logs with voice',
    description: 'Build a complete practice service log step by step — customer, vehicle, when/where, work details, voice line items, review, and submit.',
    category: 'service_logs',
    icon: 'mic',
    estimatedMinutes: 25,
    sortOrder: 20,
    lessons: [
      {
        slug: 'voice-flow',
        title: 'Build a voice service log',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Voice service logs',
            subtitle: 'Hands-on practice — nothing saves to production',
            body: 'You will walk through the full **New service log** wizard using sample fleet data. On step 5 you will choose **Use your voice** and add a practice line item.',
            icon: 'mic',
          },
          {
            type: 'content',
            title: 'What you will do',
            body: 'Each screen mirrors the real wizard. Complete every field on each step — **Continue** stays disabled until the step is done.',
            tips: [
              'Steps 1–4: customer, vehicle, date/location, and complaint.',
              'Step 5: choose Use your voice and add at least one line.',
              'Steps 6–7: review everything, then submit the practice log.',
            ],
          },
          {
            type: 'practice',
            title: 'Step 1 — Pick the customer',
            body: 'Select the fleet account this job was performed for.',
            practiceId: 'sl-customer',
          },
          {
            type: 'practice',
            title: 'Step 2 — Pick the vehicle',
            body: 'Choose the unit that was serviced. Only vehicles for your selected customer appear.',
            practiceId: 'sl-vehicle',
          },
          {
            type: 'practice',
            title: 'Step 3 — When & where',
            body: 'Enter the service date, odometer or hour reading, and where the work happened.',
            practiceId: 'sl-when',
          },
          {
            type: 'practice',
            title: 'Step 4 — What was done',
            body: 'Describe the complaint and work type. Internal notes are optional but good practice.',
            practiceId: 'sl-work',
          },
          {
            type: 'practice',
            title: 'Step 5 — Log with voice',
            body: 'Choose **Use your voice**, then add a practice line item. In production the microphone walks you through each field.',
            practiceId: 'sl-log-voice',
          },
          {
            type: 'practice',
            title: 'Step 6 — Review',
            body: 'Read back customer, vehicle, dates, and your line items before submitting.',
            practiceId: 'sl-review-voice',
          },
          {
            type: 'practice',
            title: 'Step 7 — Submit',
            body: 'Tap **Submit log (practice)** to finish. In production this sends the log to the review queue.',
            practiceId: 'sl-submit-voice',
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
            title: 'Voice logging complete',
            body: 'You built a full practice log with voice lines. On the job: Service Logs → New service log → complete steps 1–4 → Use your voice on step 5.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-photos',
    title: 'Service logs with photos',
    description: 'Build a complete practice service log with a photo upload on step 5 — same wizard, photo capture path.',
    category: 'service_logs',
    icon: 'camera',
    estimatedMinutes: 22,
    sortOrder: 30,
    lessons: [
      {
        slug: 'photo-capture',
        title: 'Build a photo service log',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Photo service logs',
            subtitle: 'Snap the paperwork — we handle the rest',
            body: 'You will complete the same wizard as the voice lesson, but on step 5 you will choose **Upload photo** and attach a practice sheet image.',
            icon: 'camera',
          },
          {
            type: 'content',
            title: 'Photo tips',
            body: 'In production, tap **Upload photo** and photograph the paper service log sheet. Training uses a placeholder so you do not need a camera.',
            tips: [
              'Include the full page — do not crop off totals or unit numbers.',
              'Multiple pages are fine; tap the zone again for each sheet.',
              'Logs stay in draft until you submit on step 6.',
            ],
          },
          {
            type: 'practice',
            title: 'Step 1 — Pick the customer',
            body: 'Select the fleet account for this practice job.',
            practiceId: 'sl-customer',
          },
          {
            type: 'practice',
            title: 'Step 2 — Pick the vehicle',
            body: 'Choose the bus or unit that was serviced.',
            practiceId: 'sl-vehicle',
          },
          {
            type: 'practice',
            title: 'Step 3 — When & where',
            body: 'Enter service date, meter reading, and job location.',
            practiceId: 'sl-when',
          },
          {
            type: 'practice',
            title: 'Step 4 — What was done',
            body: 'Enter the customer complaint and work type.',
            practiceId: 'sl-work',
          },
          {
            type: 'practice',
            title: 'Step 5 — Log with photo',
            body: 'Choose **Upload photo**, then tap **Add practice photo** to simulate attaching your paperwork.',
            practiceId: 'sl-log-photo',
          },
          {
            type: 'practice',
            title: 'Step 6 — Review',
            body: 'Confirm customer, vehicle, and that a photo is attached before submitting.',
            practiceId: 'sl-review-photo',
          },
          {
            type: 'practice',
            title: 'Step 7 — Submit',
            body: 'Submit the practice log. In production it moves to **Ready to invoice** for office review.',
            practiceId: 'sl-submit-photo',
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
            title: 'Photo logging complete',
            body: 'You built a full practice log with a photo. On the job: choose Upload photo on step 5, capture your paperwork, then review on step 6.',
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
            body: 'After you submit a log, it moves through review statuses before billing. This lesson covers what each status means.',
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
            type: 'checklist',
            title: 'Before you submit (real jobs)',
            items: [
              { label: 'Customer and vehicle selected', detail: 'Steps 1–2 of the wizard' },
              { label: 'Service date and odometer entered', detail: 'Step 3 — When & where' },
              { label: 'Complaint filled in', detail: 'Step 4 — What was done' },
              { label: 'Photo or voice lines captured', detail: 'Step 5 — Log' },
              { label: 'Reviewed on step 6', detail: 'Submit log only when accurate' },
            ],
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
    description: 'Find fleet accounts, open vehicle records, and practice navigating to Customers.',
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
            body: 'Every service log and invoice ties to a customer and usually a vehicle. This lesson covers search patterns and sidebar navigation.',
            icon: 'users',
          },
          {
            type: 'content',
            title: 'Where to search',
            body: 'Open **Customers** or **Vehicles** from the sidebar. Use the search field to filter by company name, bus number, or unit tag.',
            tips: [
              'Bus numbers and unit tags live on the vehicle record, not the customer name.',
              'From a customer detail page you can jump to their vehicles and open service history.',
            ],
          },
          {
            type: 'practice',
            title: 'Navigate to Customers',
            body: 'Tap **Customers** in the sidebar — this is where fleet account search starts.',
            practiceId: 'nav-customers',
          },
          {
            type: 'interactive',
            title: 'Search the list',
            body: 'The Customers page uses this list layout. Bus numbers like #606 appear on the linked vehicle record.',
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
    description: 'Build a complete practice invoice step by step — customer, vehicle, dates, line items, review, and save draft.',
    category: 'billing',
    icon: 'invoice',
    estimatedMinutes: 22,
    sortOrder: 60,
    lessons: [
      {
        slug: 'create-invoice',
        title: 'Create a practice invoice',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Invoice basics',
            subtitle: 'Hands-on practice — draft is not saved',
            body: 'You will walk through the full **New invoice** wizard with sample customers. Each step mirrors production; totals update from the same rules.',
            icon: 'invoice',
          },
          {
            type: 'content',
            title: 'Wizard overview',
            body: 'Five steps: Customer → Vehicle → Dates & terms → Line items → Review. Tax-exempt customers show waived tax crossed out.',
            tips: [
              'Pick a tax-exempt customer on step 1 to see how tax is waived on the review step.',
              'Add at least one line with description and quantity before continuing.',
            ],
          },
          {
            type: 'practice',
            title: 'Step 1 — Pick the customer',
            body: 'Select the billing account. Note whether they are tax exempt.',
            practiceId: 'inv-customer',
          },
          {
            type: 'practice',
            title: 'Step 2 — Pick the vehicle',
            body: 'Choose the unit this invoice is for (optional on some jobs, required here for practice).',
            practiceId: 'inv-vehicle',
          },
          {
            type: 'practice',
            title: 'Step 3 — Dates & terms',
            body: 'Set invoice date, due date, and payment terms. PO number is optional.',
            practiceId: 'inv-dates',
          },
          {
            type: 'practice',
            title: 'Step 4 — Line items',
            body: 'Edit the practice line or add more. Every line needs a description and quantity greater than zero.',
            practiceId: 'inv-lines',
          },
          {
            type: 'practice',
            title: 'Step 5 — Review',
            body: 'Check subtotal, tax (or tax exempt), and total before saving.',
            practiceId: 'inv-review',
          },
          {
            type: 'practice',
            title: 'Step 6 — Save draft',
            body: 'Tap **Save draft (practice)** to finish. In production you can preview PDF and send from the invoice detail page.',
            practiceId: 'inv-save',
          },
          {
            type: 'complete',
            title: 'Invoice basics complete',
            body: 'You built a full practice invoice. On the job: Invoices → New invoice and follow the same steps with real customers.',
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
