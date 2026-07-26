export interface TrainingCallout {
  label: string
  detail?: string
}

export interface TrainingFlowStage {
  /** Who performs this stage, e.g. "Mechanic". */
  role: string
  /** What they do. */
  action: string
  /** What the system produces afterwards. */
  result: string
}

export interface TrainingLessonStep {
  type: string
  title?: string
  subtitle?: string
  body?: string
  icon?: string
  tips?: string[]
  demo?: string
  practiceId?: string
  /** Numbered labels pointing at parts of the screen shown above. */
  callouts?: TrainingCallout[]
  /** Role-by-role pipeline for `flow` steps. */
  stages?: TrainingFlowStage[]
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
  workflow: 'How work flows',
  service_logs: 'Service logs',
  billing: 'Billing & invoices',
  customers: 'Customers & portal',
  administration: 'Administration',
  communication: 'Communication',
}

/**
 * The end-to-end job: field work becomes a paid invoice.
 * Each stage has exactly one owner and one system result.
 */
const WORKFLOW_STAGES: TrainingFlowStage[] = [
  {
    role: 'Mechanic',
    action: 'Uploads a service log from the field — photos of the paper sheet, or dictated line items.',
    result: 'Service log created as Draft',
  },
  {
    role: 'Mechanic',
    action: 'Marks the log ready once the work and parts are captured.',
    result: 'Status → Ready for review',
  },
  {
    role: 'Accountant',
    action: 'Reviews the log and confirms customer, vehicle, parts and labor.',
    result: 'Status → In review',
  },
  {
    role: 'Accountant',
    action: 'Sends the log to an invoice — line items carry over automatically.',
    result: 'Draft invoice linked to the log',
  },
  {
    role: 'Accountant',
    action: 'Checks pricing, tax and totals on the draft invoice.',
    result: 'Invoice ready to approve',
  },
  {
    role: 'Manager',
    action: 'Approves the invoice when it is over the approval threshold.',
    result: 'Status → Approved',
  },
  {
    role: 'Accountant',
    action: 'Sends the invoice. The customer gets an email with the PDF.',
    result: 'Status → Sent',
  },
  {
    role: 'Customer',
    action: 'Opens the invoice in the portal and can request a correction.',
    result: 'Request lands in Portal requests',
  },
  {
    role: 'Accountant',
    action: 'Records the payment when it arrives.',
    result: 'Status → Paid, balance clears',
  },
]

/** Default interactive training catalog — modules are role-agnostic; admins assign per user. */
export const TRAINING_CATALOG: TrainingCatalogModule[] = [
  // ── Flagship: how a job moves through the whole team ──────────
  {
    slug: 'workflow',
    title: 'The DORINC workflow',
    description: 'Follow one job from a mechanic’s service log to a paid invoice — and see exactly where your part fits.',
    category: 'workflow',
    icon: 'workflow',
    estimatedMinutes: 14,
    sortOrder: 5,
    lessons: [
      {
        slug: 'end-to-end',
        title: 'One job, start to finish',
        description: 'The whole pipeline in one view.',
        sortOrder: 10,
        steps: [
          {
            type: 'welcome',
            title: 'How work flows here',
            subtitle: 'Field work → service log → invoice → payment',
            body: 'Every job follows the same path. Learn the path once and you always know what to do next.',
            icon: 'workflow',
          },
          {
            type: 'flow',
            title: 'The pipeline',
            body: 'Each stage has one owner and one result. Nothing skips a stage.',
            stages: WORKFLOW_STAGES,
          },
          {
            type: 'content',
            title: 'Two records, one chain',
            body: 'A **service log** records what happened on the vehicle. An **invoice** bills for it. The invoice stays linked to the log it came from, so the evidence travels with the bill.',
            tips: [
              'Open an invoice and you can jump straight to its service log.',
              'Photos on the log stay attached — you never re-upload them.',
            ],
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'What creates the draft invoice?',
            options: [
              'The mechanic, when uploading the log',
              'The accountant, by sending an approved log to an invoice',
              'The customer, from the portal',
              'It is created automatically every night',
            ],
            correctIndex: 1,
            explanation: 'The accountant reviews the log first, then sends it to an invoice. Line items carry over.',
          },
          {
            type: 'complete',
            title: 'You have the map',
            body: 'Next: walk each stage in the real interface.',
          },
        ],
      },
      {
        slug: 'mechanic-stage',
        title: 'Stage 1 — Mechanic uploads the log',
        description: 'Capture the work in the field.',
        sortOrder: 20,
        steps: [
          {
            type: 'content',
            title: 'Your job: capture the work',
            body: 'You do not price anything. Record what you did, what parts you used, and which vehicle it was.',
          },
          {
            type: 'interactive',
            title: 'Start a service log',
            body: 'Service Logs → New service log. Pick the customer, then the vehicle.',
            demo: 'service-log-wizard',
            callouts: [
              { label: 'Customer then vehicle', detail: 'Vehicles are filtered to the customer you picked.' },
              { label: 'Service date', detail: 'The day the work happened, not today.' },
            ],
          },
          {
            type: 'content',
            title: 'Two ways to capture',
            body: 'Photograph the paper sheet, or dictate line items with your voice. Use whichever is faster — the voice and photo courses drill each one.',
            tips: ['Sheet photos win when the paper log is already filled in.', 'Voice wins when you are still at the vehicle.'],
          },
          {
            type: 'interactive',
            title: 'Hand it off',
            body: 'When the work is captured, mark the log ready. It moves to the accountant’s review queue.',
            demo: 'service-log-status',
            callouts: [
              { label: 'Ready for review', detail: 'This is your hand-off. You are done unless someone asks for more detail.' },
            ],
          },
          {
            type: 'checklist',
            title: 'Your checklist',
            items: [
              { label: 'Right customer and vehicle', detail: 'A wrong unit becomes a wrong invoice later.' },
              { label: 'Every part and labor line captured', detail: 'Photos or voice — do not leave gaps.' },
              { label: 'Marked ready for review', detail: 'Otherwise it sits as a draft and nobody sees it.' },
            ],
          },
        ],
      },
      {
        slug: 'accountant-stage',
        title: 'Stage 2 — Accountant builds the invoice',
        description: 'Turn the log into a bill.',
        sortOrder: 30,
        steps: [
          {
            type: 'content',
            title: 'Your job: verify, then bill',
            body: 'Check the log against the vehicle and customer, then send it to an invoice. Pricing happens on the invoice, not the log.',
          },
          {
            type: 'interactive',
            title: 'Send to invoice',
            body: 'From the reviewed log, choose Send to invoice. A draft invoice is created and stays linked to the log.',
            demo: 'send-to-invoice',
            callouts: [
              { label: 'Lines carry over', detail: 'Parts and labor from the log become invoice line items.' },
              { label: 'Link kept', detail: 'The invoice always points back to this log.' },
            ],
          },
          {
            type: 'interactive',
            title: 'Check the money',
            body: 'Confirm quantities, rates and tax. Totals recalculate from the lines every time you save.',
            demo: 'invoice-totals',
            callouts: [
              { label: 'Totals are server-side', detail: 'You cannot type a total — it is always computed from the lines.' },
              { label: 'Tax exempt', detail: 'Exempt customers show the waived tax crossed out.' },
            ],
          },
          {
            type: 'checklist',
            title: 'Your checklist',
            items: [
              { label: 'Customer, vehicle and date match the log' },
              { label: 'Every line has a quantity and a price' },
              { label: 'Tax looks right for this customer' },
              { label: 'Sent for approval if it is over the threshold' },
            ],
          },
        ],
      },
      {
        slug: 'customer-stage',
        title: 'Stage 3 — The customer gets it',
        description: 'Send, then get paid.',
        sortOrder: 40,
        steps: [
          {
            type: 'interactive',
            title: 'Send the invoice',
            body: 'Sending emails the customer a PDF and moves the invoice to Sent.',
            demo: 'invoice-send',
            callouts: [
              { label: 'PDF attached', detail: 'Generated from your invoice template.' },
              { label: 'Status → Sent', detail: 'The balance is now owed.' },
            ],
          },
          {
            type: 'interactive',
            title: 'What the customer sees',
            body: 'In the portal they see the invoice, its balance, and the vehicle it covers.',
            demo: 'portal-invoice',
            callouts: [
              { label: 'Request a correction', detail: 'Their request appears in Portal requests for staff to review.' },
            ],
          },
          {
            type: 'content',
            title: 'Close it out',
            body: 'When payment arrives, record it on the invoice. The balance drops and the status becomes **Paid** once it reaches zero.',
            tips: ['Partial payments are fine — the balance tracks what is left.'],
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'A customer disputes a line. Where does their request go?',
            options: ['Direct messages', 'Portal requests', 'The audit log', 'It emails the mechanic'],
            correctIndex: 1,
            explanation: 'Portal requests is the staff queue for anything a customer submits from the portal.',
          },
          {
            type: 'complete',
            title: 'Full circle',
            body: 'You can now follow any job from the field to a paid invoice.',
            icon: 'workflow',
          },
        ],
      },
    ],
  },
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
    title: 'Team messages',
    description: 'Talk to coworkers in the team channel and attach the record you are discussing.',
    category: 'communication',
    icon: 'message',
    estimatedMinutes: 9,
    sortOrder: 70,
    lessons: [
      {
        slug: 'dm-basics',
        title: 'Talk to the team',
        description: 'Where staff chat lives and how to keep it useful.',
        sortOrder: 1,
        steps: [
          {
            type: 'welcome',
            title: 'Team messages',
            subtitle: 'Internal only — customers never see this',
            body: 'Open Messages from the sidebar or the bubble in the top bar. The badge counts what you have not read.',
            icon: 'message',
          },
          {
            type: 'interactive',
            title: 'Two channels, one screen',
            body: 'Messages splits into Team for staff chat and Email for customer threads. Know which one you are typing in.',
            demo: 'staff-messages',
            callouts: [
              { label: 'Team', detail: 'Internal. Safe for notes, questions and decisions.' },
              { label: 'Email', detail: 'Goes to the customer. Treat every word as public.' },
            ],
          },
          {
            type: 'practice',
            title: 'Open the team channel',
            body: 'Pick the channel that stays internal.',
            practiceId: 'msg-team-tab',
          },
          {
            type: 'content',
            title: 'Always reference the record',
            body: 'Say **which invoice or service log** you mean. "The Acme one" costs the next person five minutes of searching; "INV-000318" costs them nothing.',
            tips: [
              'Reference the number in the text and attach the record itself.',
              'Attached references are clickable — the reader jumps straight to it.',
            ],
          },
          {
            type: 'practice',
            title: 'Attach the record',
            body: 'You are asking a coworker about an invoice. Attach it so they can open it.',
            practiceId: 'msg-attach-record',
          },
          {
            type: 'checklist',
            title: 'A message worth reading',
            items: [
              { label: 'Right channel', detail: 'Team for internal, Email for the customer.' },
              { label: 'Record referenced', detail: 'Number in the text, record attached.' },
              { label: 'Ask something specific', detail: '"Can you approve INV-000318?" beats "any update?"' },
            ],
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'You need to tell a customer their invoice is ready. Where do you write it?',
            options: [
              'The Team channel',
              'The Email channel',
              'A note on the service log',
              'The audit log',
            ],
            correctIndex: 1,
            explanation: 'Team is internal. Anything the customer should read goes in the Email channel.',
          },
          {
            type: 'complete',
            title: 'Team messaging ready',
            body: 'Reference the record, ask something specific, keep customer wording in Email.',
          },
        ],
      },
    ],
  },
  {
    slug: 'customer-email',
    title: 'Customer email',
    description: 'Read the threads customers send you all day, reply in place, and start a new email to a customer.',
    category: 'communication',
    icon: 'portal',
    estimatedMinutes: 12,
    sortOrder: 75,
    lessons: [
      {
        slug: 'read-and-reply',
        title: 'Reading what customers send',
        description: 'The inbox is shared — treat it like a queue.',
        sortOrder: 10,
        steps: [
          {
            type: 'welcome',
            title: 'Customers email you constantly',
            subtitle: 'Questions, POs, disputes, "is it done yet?"',
            body: 'Every customer email lands in the shared Email channel — not in someone’s personal mailbox. If you can see it, you can answer it.',
            icon: 'portal',
          },
          {
            type: 'practice',
            title: 'Open the Email channel',
            body: 'Switch to the channel that holds customer threads.',
            practiceId: 'msg-email-tab',
          },
          {
            type: 'practice',
            title: 'Open an unread thread',
            body: 'Acme Fleet Services wrote in. Open their thread.',
            practiceId: 'msg-open-thread',
          },
          {
            type: 'content',
            title: 'Read the whole thread first',
            body: 'A thread keeps every message and attachment together. Scroll up before you answer — the PO number or photo you need is usually already there.',
            tips: [
              'Attachments they send stay on the thread; you never ask twice.',
              'If it is about an invoice, open the invoice next to the thread before replying.',
            ],
          },
          {
            type: 'practice',
            title: 'Reply, do not start over',
            body: 'Answer on the thread that already exists.',
            practiceId: 'msg-reply',
          },
          {
            type: 'checklist',
            title: 'Before you hit reply',
            items: [
              { label: 'Read the whole thread', detail: 'The answer is often two messages up.' },
              { label: 'Check the record', detail: 'Open the invoice or log they are asking about.' },
              { label: 'Reply on the thread', detail: 'A new email splits the conversation in two.' },
            ],
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'A customer replies asking about a charge. What do you do first?',
            options: [
              'Start a new email so it is clean',
              'Read the thread and open the invoice, then reply in place',
              'Forward it to the mechanic',
              'Delete it and call them',
            ],
            correctIndex: 1,
            explanation: 'Read the context, check the record, then reply on the same thread so the history stays in one place.',
          },
          {
            type: 'complete',
            title: 'Inbox handled',
            body: 'Next: starting an email yourself.',
          },
        ],
      },
      {
        slug: 'send-to-customer',
        title: 'Emailing a customer',
        description: 'Start a thread from scratch.',
        sortOrder: 20,
        steps: [
          {
            type: 'content',
            title: 'When you start the email',
            body: 'Sending an invoice already emails the customer. Use the Email channel when you need something extra — a question, a heads-up, or a document that is not the invoice.',
          },
          {
            type: 'practice',
            title: 'Choose the customer',
            body: 'Pick who you are writing to. The address comes from their customer record.',
            practiceId: 'msg-pick-customer',
          },
          {
            type: 'practice',
            title: 'Write it',
            body: 'A subject that names the record, and a message short enough to read on a phone.',
            practiceId: 'msg-compose',
          },
          {
            type: 'practice',
            title: 'Send',
            body: 'Send the email to create the thread.',
            practiceId: 'msg-send',
          },
          {
            type: 'content',
            title: 'What happens next',
            body: 'Your email becomes a thread in the Email channel. Their reply lands on the same thread, so anyone on the team can pick it up.',
            tips: ['Wrong address? Fix it on the customer record, not just in this email.'],
          },
          {
            type: 'checklist',
            title: 'Customer email standards',
            items: [
              { label: 'Subject names the record', detail: '"Invoice INV-000318 — labor hours" not "Question".' },
              { label: 'One topic per thread', detail: 'Separate topics are separate threads.' },
              { label: 'No internal wording', detail: 'If it belongs in Team, it does not belong here.' },
            ],
          },
          {
            type: 'complete',
            title: 'You can run the inbox',
            body: 'Read the thread, check the record, reply in place — and start a clean thread when you need one.',
            icon: 'portal',
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

  // ── What the other side of the app looks like ─────────────────
  {
    slug: 'customer-portal',
    title: 'The customer portal',
    description: 'What customers can see and do — and how their requests reach your queue.',
    category: 'customers',
    icon: 'portal',
    estimatedMinutes: 8,
    sortOrder: 85,
    lessons: [
      {
        slug: 'portal-and-requests',
        title: 'Their side of the app',
        description: 'Read-only for them, a queue for you.',
        sortOrder: 10,
        steps: [
          {
            type: 'welcome',
            title: 'The customer’s view',
            subtitle: 'They read. You decide.',
            body: 'Customers get a portal for their own records. Knowing what they see stops a lot of phone calls.',
            icon: 'portal',
          },
          {
            type: 'interactive',
            title: 'What they see',
            body: 'Their own invoices, vehicles and service history. Nothing else, and never your drafts.',
            demo: 'portal-invoice',
            callouts: [
              { label: 'Sent and paid only', detail: 'Drafts stay internal until you send them.' },
            ],
          },
          {
            type: 'content',
            title: 'Requests, not edits',
            body: 'Customers cannot change records. They submit a **request** and staff approve or reject it, so every change stays reviewable.',
          },
          {
            type: 'interactive',
            title: 'Where requests land',
            body: 'Portal requests is the staff queue for corrections, new vehicles and service requests.',
            demo: 'portal-requests',
            callouts: [
              { label: 'Approve or reject', detail: 'The customer is notified either way.' },
            ],
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'A customer says a vehicle’s unit number is wrong. What happens?',
            options: [
              'They edit the vehicle themselves',
              'They submit a change request for staff to review',
              'Nothing — only mechanics can report it',
              'The invoice is deleted',
            ],
            correctIndex: 1,
            explanation: 'Portal users request changes; staff approve or reject them from Portal requests.',
          },
          {
            type: 'complete',
            title: 'Portal covered',
            body: 'Customers read and request. Staff decide.',
          },
        ],
      },
    ],
  },
]

export function trainingCategoryLabel(category: string): string {
  return TRAINING_CATEGORIES[category] ?? category.replace(/_/g, ' ')
}
