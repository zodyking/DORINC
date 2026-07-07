import { hash, verify } from '@node-rs/argon2'

// Argon2id per SPEC §19 (OWASP-recommended parameters)
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  }
  catch {
    return false
  }
}
