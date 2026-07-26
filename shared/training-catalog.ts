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
            body: 'This tutorial walks through the staff sidebar, top bar, and the fastest ways to jump between customers, vehicles, service logs, and invoices. You can pause anytime — progress saves automatically.',
            icon: 'compass',
          },
          {
            type: 'content',
            title: 'The sidebar is your map',
            body: 'The left sidebar groups tools into Workspace (day-to-day work), System (users & audit), and Administration (control panel). Items only appear when your role has access.',
            tips: [
              'On mobile, tap the menu icon to open the sidebar.',
              'Your name and role appear at the bottom — tap Account for password and profile settings.',
            ],
          },
          {
            type: 'interactive',
            title: 'Explore the sidebar',
            body: 'Highlighted items show where common tasks live. Tap each hotspot to learn what it does.',
            demo: 'nav-sidebar',
          },
          {
            type: 'quiz',
            title: 'Quick check',
            question: 'Where do you create a new service log?',
            options: ['Customers', 'Service Logs', 'System Logs', 'Catalog'],
            correctIndex: 1,
            explanation: 'Service Logs is where mechanics upload photos or dictate line items for field work.',
          },
          {
            type: 'complete',
            title: 'Navigation basics complete',
            body: 'You are ready to explore the app. Use the sidebar to open any section you have permission to view.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-voice',
    title: 'Service logs with voice',
    description: 'Hands-free line entry: dictate parts, labor, and fees while the wizard captures quantity, description, and price.',
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
            body: 'When you cannot type on a phone, the digital log mode listens as you speak each line item. The app prompts for line type, description, quantity, and rate — one field at a time.',
            icon: 'mic',
          },
          {
            type: 'content',
            title: 'When to use voice mode',
            body: 'On the Log step of a new service log, choose **Digital log** instead of photo upload. Voice works best in a quiet cab or bay with your microphone enabled.',
            tips: [
              'Speak clearly: "Labor, replaced DPF sensor, two hours, one forty-five an hour."',
              'You can add multiple lines before submitting the log.',
              'Review the line list before finalize — edit any row manually if speech misheard a number.',
            ],
          },
          {
            type: 'interactive',
            title: 'Try the voice wizard',
            body: 'This simulation shows the speak-then-listen flow. In the real app, your browser will ask for microphone permission once.',
            demo: 'voice-wizard',
          },
          {
            type: 'checklist',
            title: 'Before you submit',
            items: [
              { label: 'Customer and vehicle selected', detail: 'Steps 1–2 of the wizard' },
              { label: 'Service date and odometer entered', detail: 'Helps billing and history' },
              { label: 'Each line has type, description, qty, and rate', detail: 'Voice or manual entry' },
              { label: 'Complaint notes captured', detail: 'What the driver reported' },
            ],
          },
          {
            type: 'quiz',
            title: 'Voice mode quiz',
            question: 'Which log record mode enables the line-item voice wizard?',
            options: ['Photo upload', 'Digital log', 'PDF import', 'Quick scan'],
            correctIndex: 1,
            explanation: 'Digital log opens the Line Item Wizard with voice prompts for each field.',
          },
          {
            type: 'complete',
            title: 'Voice logging ready',
            body: 'Open Service Logs → New, walk through customer and vehicle, then pick Digital log on step 5.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-photos',
    title: 'Service logs with photos',
    description: 'Capture paper work orders, handwritten notes, or bay photos and attach them to a service log.',
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
            body: 'Photo mode is ideal when you have a handwritten ticket or want the office to extract line items later. Upload one or more images before submitting.',
            icon: 'camera',
          },
          {
            type: 'content',
            title: 'Photo tips for clean uploads',
            body: 'Use **Upload photo** on the Log step. On mobile, the camera opens directly. Flat, well-lit photos help accountants run AI extraction faster.',
            tips: [
              'Include the full page — do not crop off totals or VIN.',
              'Multiple angles are fine; add each as a separate photo.',
              'Logs stay in draft until you finalize — you can add photos later from the log detail page.',
            ],
          },
          {
            type: 'interactive',
            title: 'Photo capture demo',
            body: 'See how the upload tile and preview strip work on a phone-sized screen.',
            demo: 'photo-capture',
          },
          {
            type: 'quiz',
            title: 'Photo mode check',
            question: 'What happens after you upload photos but before finalize?',
            options: [
              'Invoice is emailed automatically',
              'Log stays editable in draft / ready for review',
              'Photos are deleted after 24 hours',
              'Customer is charged immediately',
            ],
            correctIndex: 1,
            explanation: 'Service logs progress through draft and review states; billing happens after office review.',
          },
          {
            type: 'complete',
            title: 'Photo logging ready',
            body: 'Choose Upload photo on step 5, capture your paperwork, then submit when the vehicle info and complaint are complete.',
          },
        ],
      },
    ],
  },
  {
    slug: 'service-log-submit',
    title: 'Submitting service logs',
    description: 'Finalize logs, understand review status, and send approved work to invoice when permitted.',
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
            body: 'Service logs move through clear statuses so the office knows what needs review. This lesson covers submit, review, and send-to-invoice.',
            icon: 'clipboard',
          },
          {
            type: 'content',
            title: 'Status meanings',
            body: '**Draft** — still editing. **Ready for review** — submitted to the office. **Approved** — ready for billing. **Invoiced** — linked to an invoice.',
            tips: [
              'Mechanics typically submit as ready for review.',
              'You can undo send-to-invoice on your own logs if your role allows it.',
            ],
          },
          {
            type: 'interactive',
            title: 'Status timeline',
            body: 'Follow a log from creation through review.',
            demo: 'log-status',
          },
          {
            type: 'complete',
            title: 'Submission flow understood',
            body: 'Always double-check customer, vehicle, and line items before tapping submit.',
          },
        ],
      },
    ],
  },
  {
    slug: 'customer-vehicle-lookup',
    title: 'Customers & vehicles',
    description: 'Find fleet accounts, open vehicle records, and understand unit numbers vs tags.',
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
            body: 'Every service log and invoice ties to a customer and usually a vehicle. Learn how to search quickly in the field.',
            icon: 'users',
          },
          {
            type: 'interactive',
            title: 'Search demo',
            body: 'Practice searching by company name, bus number, or unit tag.',
            demo: 'customer-search',
          },
          {
            type: 'quiz',
            title: 'Lookup quiz',
            question: 'A bus is labeled "#606" in the yard. Where is that stored?',
            options: ['Customer display name', 'Vehicle bus number', 'Invoice PO field', 'Catalog SKU'],
            correctIndex: 1,
            explanation: 'Bus number and unit tag live on the vehicle record linked to the fleet customer.',
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
    description: 'Create draft invoices, add line items, understand tax exempt customers, and preview PDFs.',
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
            body: 'Invoices capture billable work from catalog items or custom lines. This module covers the creator wizard and totals panel.',
            icon: 'invoice',
          },
          {
            type: 'content',
            title: 'Wizard steps',
            body: 'New invoice → pick customer → vehicle (optional) → dates → line items → review → save draft. Totals update live from server rules.',
            tips: [
              'Tax exempt customers show waived tax crossed out — not added to total.',
              'Catalog quick-add fills description, type, and default price.',
            ],
          },
          {
            type: 'interactive',
            title: 'Invoice wizard preview',
            body: 'See the step bar and line entry panel.',
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
    description: 'Send and receive staff DMs, see unread badges, and keep shop communication in one place.',
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
            body: 'Use Messages in the top bar for direct chats with coworkers. Unread counts appear on the icon.',
            icon: 'message',
          },
          {
            type: 'content',
            title: 'Best practices',
            body: 'Reference invoice or log numbers in messages so recipients can find records quickly. Messages are internal — customers never see this inbox.',
            tips: ['Start a new DM from the compose button.', 'Group threads may include multiple staff on the same topic.'],
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
    description: 'Invite users, assign account types, approve signups, and assign training modules.',
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
            body: 'Admins and managers can invite staff, change account types, and assign training. Assigned modules can lock login until complete.',
            icon: 'shield',
          },
          {
            type: 'content',
            title: 'Assigning training',
            body: 'Open **Users** → select a person → **Training** section, or use **Training** in the sidebar to assign modules. Lock access forces completion before other pages load.',
            tips: [
              'Modules are shared across roles — assign navigation to everyone, voice logs to mechanics, etc.',
              'Due dates are optional reminders; lock is controlled per assignment.',
            ],
          },
          {
            type: 'interactive',
            title: 'Assign training demo',
            body: 'See how admins pick modules and toggle lock-until-complete.',
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
