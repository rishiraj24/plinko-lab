// lib/db/prisma.ts

import { PrismaClient } from '@prisma/client'

// Prevent multiple Prisma instances during Next.js hot reload in development.
// In production, each serverless function gets one instance anyway.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma