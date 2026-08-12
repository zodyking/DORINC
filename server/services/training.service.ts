import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  trainingModules,
  trainingLessonProgress,
  trainingLessons,
  trainingAssignments,
} from '../db/schema/training'
import { users, accountTypes } from '../db/schema/auth'
import { TRAINING_CATALOG } from '../../shared/training-catalog'

export class TrainingServiceError extends Error {
  constructor(public code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_ASSIGNED' | 'NOT_ASSIGNED' | 'INVALID') {
    super(code)
    this.name = 'TrainingServiceError'
  }
}

export interface TrainingGateResult {
  locked: boolean
  assignmentId: string | null
  moduleId: string | null
  moduleSlug: string | null
  moduleTitle: string | null
}

export async function syncTrainingCatalog(db: Db) {
  for (const mod of TRAINING_CATALOG) {
    const [existing] = await db.select().from(trainingModules).where(eq(trainingModules.slug, mod.slug))
    let moduleId: string
    if (!existing) {
      const [inserted] = await db.insert(trainingModules).values({
        slug: mod.slug,
        title: mod.title,
        description: mod.description,
        category: mod.category,
        icon: mod.icon,
        estimatedMinutes: mod.estimatedMinutes,
        sortOrder: mod.sortOrder,
        isPublished: true,
      }).returning()
      moduleId = inserted!.id
    }
    else {
      await db.update(trainingModules).set({
        title: mod.title,
        description: mod.description,
        category: mod.category,
        icon: mod.icon,
        estimatedMinutes: mod.estimatedMinutes,
        sortOrder: mod.sortOrder,
        updatedAt: new Date(),
      }).where(eq(trainingModules.id, existing.id))
      moduleId = existing.id
    }

    for (const lesson of mod.lessons) {
      const [lessonRow] = await db.select().from(trainingLessons)
        .where(and(eq(trainingLessons.moduleId, moduleId!), eq(trainingLessons.slug, lesson.slug)))
      if (!lessonRow) {
        await db.insert(trainingLessons).values({
          moduleId: moduleId!,
          slug: lesson.slug,
          title: lesson.title,
          description: lesson.description ?? null,
          steps: lesson.steps,
          sortOrder: lesson.sortOrder,
        })
      }
      else {
        await db.update(trainingLessons).set({
          title: lesson.title,
          description: lesson.description ?? null,
          steps: lesson.steps,
          sortOrder: lesson.sortOrder,
          updatedAt: new Date(),
        }).where(eq(trainingLessons.id, lessonRow.id))
      }
    }
  }
}

export async function listTrainingModules(db: Db, opts: { includeUnpublished?: boolean } = {}) {
  const base = db.select().from(trainingModules)
  const rows = await (opts.includeUnpublished
    ? base.orderBy(asc(trainingModules.sortOrder), asc(trainingModules.title))
    : base.where(eq(trainingModules.isPublished, true))
        .orderBy(asc(trainingModules.sortOrder), asc(trainingModules.title)))

  const lessonCounts = await db.select({
    moduleId: trainingLessons.moduleId,
    count: sql<number>`count(*)::int`,
  }).from(trainingLessons).groupBy(trainingLessons.moduleId)

  const countMap = new Map(lessonCounts.map(r => [r.moduleId, r.count]))

  return rows.map(row => ({
    ...row,
    lessonCount: countMap.get(row.id) ?? 0,
  }))
}

export async function getTrainingModuleDetail(db: Db, moduleIdOrSlug: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(moduleIdOrSlug)
  const [module] = await db.select().from(trainingModules)
    .where(isUuid
      ? eq(trainingModules.id, moduleIdOrSlug)
      : eq(trainingModules.slug, moduleIdOrSlug))
  if (!module) throw new TrainingServiceError('NOT_FOUND')

  const lessons = await db.select().from(trainingLessons)
    .where(eq(trainingLessons.moduleId, module.id))
    .orderBy(asc(trainingLessons.sortOrder), asc(trainingLessons.title))

  return { module, lessons }
}

export async function listUserAssignments(db: Db, userId: string) {
  const rows = await db.select({
    assignment: trainingAssignments,
    module: trainingModules,
  })
    .from(trainingAssignments)
    .innerJoin(trainingModules, eq(trainingAssignments.moduleId, trainingModules.id))
    .where(eq(trainingAssignments.userId, userId))
    .orderBy(asc(trainingAssignments.assignedAt))

  const progress = await db.select().from(trainingLessonProgress)
    .where(eq(trainingLessonProgress.userId, userId))

  const lessonsByModule = await db.select().from(trainingLessons)
  const lessonCountByModule = new Map<string, number>()
  for (const lesson of lessonsByModule) {
    lessonCountByModule.set(lesson.moduleId, (lessonCountByModule.get(lesson.moduleId) ?? 0) + 1)
  }

  const completedByAssignment = new Map<string, number>()
  for (const p of progress) {
    if (p.completedAt) {
      completedByAssignment.set(p.assignmentId, (completedByAssignment.get(p.assignmentId) ?? 0) + 1)
    }
  }

  return rows.map(({ assignment, module }) => {
    const totalLessons = lessonCountByModule.get(module.id) ?? 0
    const completedLessons = completedByAssignment.get(assignment.id) ?? 0
    const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
    return {
      ...assignment,
      module,
      totalLessons,
      completedLessons,
      progressPercent: percent,
    }
  })
}

export async function getTrainingGate(db: Db, userId: string): Promise<TrainingGateResult> {
  const open = await db.select({
    assignment: trainingAssignments,
    module: trainingModules,
  })
    .from(trainingAssignments)
    .innerJoin(trainingModules, eq(trainingAssignments.moduleId, trainingModules.id))
    .where(and(
      eq(trainingAssignments.userId, userId),
      eq(trainingAssignments.locksAccess, true),
      ne(trainingAssignments.status, 'completed'),
      // Unpublished / draft modules must not trap users in a login gate.
      eq(trainingModules.isPublished, true),
    ))
    .orderBy(asc(trainingAssignments.assignedAt))
    .limit(1)

  const hit = open[0]
  if (!hit) {
    return {
      locked: false,
      assignmentId: null,
      moduleId: null,
      moduleSlug: null,
      moduleTitle: null,
    }
  }

  return {
    locked: true,
    assignmentId: hit.assignment.id,
    moduleId: hit.module.id,
    moduleSlug: hit.module.slug,
    moduleTitle: hit.module.title,
  }
}

export async function assignTrainingModule(
  db: Db,
  input: {
    userId: string
    moduleId: string
    assignedBy: string
    locksAccess?: boolean
    dueAt?: Date | null
    notes?: string | null
  },
) {
  const [module] = await db.select().from(trainingModules).where(eq(trainingModules.id, input.moduleId))
  if (!module) throw new TrainingServiceError('NOT_FOUND')

  const [user] = await db.select({ id: users.id, accountType: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, input.userId))
  if (!user) throw new TrainingServiceError('NOT_FOUND')
  if (user.accountType === 'customer') throw new TrainingServiceError('FORBIDDEN')

  const [existing] = await db.select().from(trainingAssignments)
    .where(and(
      eq(trainingAssignments.userId, input.userId),
      eq(trainingAssignments.moduleId, input.moduleId),
    ))
  if (existing && existing.status !== 'completed') {
    throw new TrainingServiceError('ALREADY_ASSIGNED')
  }

  if (existing?.status === 'completed') {
    const [row] = await db.update(trainingAssignments).set({
      assignedBy: input.assignedBy,
      assignedAt: new Date(),
      dueAt: input.dueAt ?? null,
      completedAt: null,
      status: 'assigned',
      locksAccess: input.locksAccess ?? true,
      notes: input.notes?.trim() || null,
    }).where(eq(trainingAssignments.id, existing.id)).returning()
    return row!
  }

  const [row] = await db.insert(trainingAssignments).values({
    userId: input.userId,
    moduleId: input.moduleId,
    assignedBy: input.assignedBy,
    dueAt: input.dueAt ?? null,
    locksAccess: input.locksAccess ?? true,
    notes: input.notes?.trim() || null,
  }).returning()

  return row!
}

export async function unassignTrainingModule(db: Db, assignmentId: string) {
  const [row] = await db.delete(trainingAssignments)
    .where(eq(trainingAssignments.id, assignmentId))
    .returning()
  if (!row) throw new TrainingServiceError('NOT_FOUND')
  return row
}

export async function saveLessonProgress(
  db: Db,
  input: {
    userId: string
    assignmentId: string
    lessonId: string
    stepIndex: number
    completed: boolean
  },
) {
  const [assignment] = await db.select().from(trainingAssignments)
    .where(and(
      eq(trainingAssignments.id, input.assignmentId),
      eq(trainingAssignments.userId, input.userId),
    ))
  if (!assignment) throw new TrainingServiceError('NOT_ASSIGNED')

  const [lesson] = await db.select().from(trainingLessons)
    .where(and(eq(trainingLessons.id, input.lessonId), eq(trainingLessons.moduleId, assignment.moduleId)))
  if (!lesson) throw new TrainingServiceError('NOT_FOUND')

  const [existing] = await db.select().from(trainingLessonProgress)
    .where(and(
      eq(trainingLessonProgress.assignmentId, input.assignmentId),
      eq(trainingLessonProgress.lessonId, input.lessonId),
    ))

  const values = {
    stepIndex: input.stepIndex,
    completedAt: input.completed ? new Date() : null,
  }

  if (existing) {
    await db.update(trainingLessonProgress).set(values)
      .where(eq(trainingLessonProgress.id, existing.id))
  }
  else {
    await db.insert(trainingLessonProgress).values({
      assignmentId: input.assignmentId,
      lessonId: input.lessonId,
      userId: input.userId,
      ...values,
    })
  }

  if (assignment.status === 'assigned') {
    await db.update(trainingAssignments).set({ status: 'in_progress' })
      .where(eq(trainingAssignments.id, assignment.id))
  }

  if (input.completed) {
    await maybeCompleteAssignment(db, assignment.id, assignment.userId, assignment.moduleId)
  }

  return { ok: true }
}

async function maybeCompleteAssignment(db: Db, assignmentId: string, userId: string, moduleId: string) {
  const lessons = await db.select({ id: trainingLessons.id }).from(trainingLessons)
    .where(eq(trainingLessons.moduleId, moduleId))
  if (!lessons.length) return

  const completed = await db.select({ lessonId: trainingLessonProgress.lessonId })
    .from(trainingLessonProgress)
    .where(and(
      eq(trainingLessonProgress.assignmentId, assignmentId),
      eq(trainingLessonProgress.userId, userId),
      sql`${trainingLessonProgress.completedAt} IS NOT NULL`,
    ))

  const completedSet = new Set(completed.map(c => c.lessonId))
  const allDone = lessons.every(l => completedSet.has(l.id))
  if (!allDone) return

  await db.update(trainingAssignments).set({
    status: 'completed',
    completedAt: new Date(),
  }).where(eq(trainingAssignments.id, assignmentId))
}

export async function listAllAssignments(db: Db, opts: { userId?: string, moduleId?: string } = {}) {
  const conditions = []
  if (opts.userId) conditions.push(eq(trainingAssignments.userId, opts.userId))
  if (opts.moduleId) conditions.push(eq(trainingAssignments.moduleId, opts.moduleId))

  const rows = await db.select({
    assignment: trainingAssignments,
    module: trainingModules,
    userName: users.name,
    userEmail: users.email,
    accountType: accountTypes.key,
  })
    .from(trainingAssignments)
    .innerJoin(trainingModules, eq(trainingAssignments.moduleId, trainingModules.id))
    .innerJoin(users, eq(trainingAssignments.userId, users.id))
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(trainingAssignments.assignedAt))

  return rows.map(r => ({
    ...r.assignment,
    module: r.module,
    user: { name: r.userName, email: r.userEmail, accountType: r.accountType },
  }))
}

export function stripLessonStepsForList(lessons: Array<{ steps: TrainingLessonStep[] } & Record<string, unknown>>) {
  return lessons.map(({ steps, ...rest }) => ({
    ...rest,
    stepCount: steps.length,
  }))
}
