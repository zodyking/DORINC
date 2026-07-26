import { z } from 'zod'

export const trainingAssignSchema = z.object({
  userId: z.string().uuid(),
  moduleId: z.string().uuid(),
  locksAccess: z.boolean().optional().default(true),
  dueAt: z.string().datetime().nullish(),
  notes: z.string().max(2000).nullish(),
})

export const trainingProgressSchema = z.object({
  assignmentId: z.string().uuid(),
  lessonId: z.string().uuid(),
  stepIndex: z.number().int().min(0),
  completed: z.boolean(),
})

export const trainingBulkAssignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
  moduleId: z.string().uuid(),
  locksAccess: z.boolean().optional().default(true),
  dueAt: z.string().datetime().nullish(),
  notes: z.string().max(2000).nullish(),
})
