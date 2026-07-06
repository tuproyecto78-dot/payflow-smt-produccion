import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Lazy Prisma client — only initializes when first accessed.
 * This prevents "Environment variable not found: DATABASE_URL" errors
 * in production (Vercel) when DATABASE_URL is not set.
 *
 * The PrismaClient is only created when db is actually used,
 * not when the module is imported.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['query'] : [],
  })
}

// Use a Proxy to lazily initialize PrismaClient only on first access
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient()
    }
    const value = (globalForPrisma.prisma as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(globalForPrisma.prisma) : value
  },
})
