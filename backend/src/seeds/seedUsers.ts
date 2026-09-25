import { pathToFileURL } from 'node:url'
import { env } from '../config/env.js'
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../config/db.js'
import { Authority, User } from '../models/index.js'
import { hashPassword } from '../services/auth.service.js'

interface DevAuthorityUserSeed {
  name: string
  username: string
  authorityCode: string
}

const DEV_AUTHORITY_USERS: DevAuthorityUserSeed[] = [
  { name: 'Kunnamthanam Authority', username: 'kunnamthanam_gp', authorityCode: 'KNM-GP' },
  { name: 'Adoor Authority', username: 'adoor_municipality', authorityCode: 'ADOR-MUN' },
  { name: 'Kottayam Authority', username: 'kottayam_municipality', authorityCode: 'KTYM-MUN' },
  { name: 'Kochi Authority', username: 'kochi_municipal_corporation', authorityCode: 'KCHI-CORP' },
]

export async function seedAuthorityUsers(): Promise<void> {
  const password = env.seedDevPassword

  if (!password || password.length < 8) {
    throw new Error('SEED_DEV_PASSWORD must be set and at least 8 characters long.')
  }

  const passwordHash = await hashPassword(password)

  for (const seed of DEV_AUTHORITY_USERS) {
    const authority = await Authority.findOne({ code: seed.authorityCode })

    if (!authority) {
      throw new Error(
        `Cannot seed user "${seed.username}": authority with code "${seed.authorityCode}" was not found. Run "npm run seed --prefix backend" first.`,
      )
    }

    await User.findOneAndUpdate(
      { username: seed.username },
      {
        $set: {
          name: seed.name,
          username: seed.username,
          passwordHash,
          role: 'authority',
          authorityId: authority._id,
          isActive: true,
        },
      },
      { upsert: true, new: true, runValidators: true },
    )

    // The password and hash are intentionally never printed or logged.
    console.log(`Authority user ready: ${seed.username} → ${authority.name} (${seed.authorityCode})`)
  }
}

async function runSeedUsers(uri: string): Promise<void> {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env before seeding authority users.')
  }

  await connectDatabase()

  if (!isDatabaseConnected()) {
    throw new Error('Could not connect to MongoDB. Check MONGODB_URI in backend/.env.')
  }

  await seedAuthorityUsers()
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  runSeedUsers(env.mongoUri)
    .catch((err) => {
      console.error('Seed users failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(async () => {
      await disconnectDatabase()
    })
}