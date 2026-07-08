import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { WorkerJobType } from '../db/schema/jobs'
import { workerJobs } from '../db/schema/jobs'

/** Queue a background job for the worker containers (SPEC §18). */
export async function enqueueJob(db: Db, jobType: WorkerJobType, payload: Record<string, unknown>, maxAttempts = 3) {
  const [row] = await db.insert(workerJobs).values({
    jobType,
    payload,
    maxAttempts,
  }).returning()
  return row!
}

export async function getJob(db: Db, id: string) {
  const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, id))
  return row ?? null
}
