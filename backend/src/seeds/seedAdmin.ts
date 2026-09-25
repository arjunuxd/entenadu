import { pathToFileURL } from 'node:url'
import { env } from '../config/env.js'
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../config/db.js'
import { User } from '../models/index.js'
import { hashPassword } from '../services/auth.service.js'

export async function seedAdmin(): Promise<void> {
  const { seedAdmin } = env

  if (!seedAdmin.username) {
    throw new Error('SEED_ADMIN_USERNAME is not set. Add it to backend/.env before seeding the admin.')
  }

  if (!seedAdmin.password) {
    throw new Error('SEED_ADMIN_PASSWORD is not set. Add it to backend/.env before seeding the admin.')
  }

  if (seedAdmin.password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters long.')
  }

  const passwordHash = await hashPassword(seedAdmin.password)

  await User.findOneAndUpdate(
    { username: seedAdmin.username },
    {
      $set: {
        name: seedAdmin.name,
        username: seedAdmin.username,
        passwordHash,
        role: 'admin',
        authorityId: null,
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true },
  )

  // The password and hash are intentionally never printed or logged.
  console.log(`Admin user ready: ${seedAdmin.username} (role: admin)`)
}

async function runSeedAdmin(uri: string): Promise<void> {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env before seeding the admin.')
  }

  await connectDatabase()

  if (!isDatabaseConnected()) {
    throw new Error('Could not connect to MongoDB. Check MONGODB_URI in backend/.env.')
  }

  await seedAdmin()
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  runSeedAdmin(env.mongoUri)
    .catch((err) => {
      console.error('Seed admin failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(async () => {
      await disconnectDatabase()
    })
}