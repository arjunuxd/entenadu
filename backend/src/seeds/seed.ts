import { pathToFileURL } from 'node:url'
import type { AnyBulkWriteOperation } from 'mongoose'
import mongoose, { HydratedDocument, type Types } from 'mongoose'
import { env } from '../config/env.js'
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../config/db.js'
import { Authority, Place, type AuthorityType, type Place as PlaceModel } from '../models/index.js'
import { normalizeName } from '../utils/normalize.js'

interface AuthoritySeed {
  code: string
  name: string
  type: AuthorityType
  district: string
}

interface PlaceSeed {
  name: string
  district: string
  authorityCode: string
  aliases: string[]
}

export const AUTHORITY_SEEDS: AuthoritySeed[] = [
  { code: 'KNM-GP', name: 'Kunnamthanam Grama Panchayat', type: 'Grama Panchayat', district: 'Pathanamthitta' },
  { code: 'ADOR-MUN', name: 'Adoor Municipality', type: 'Municipality', district: 'Pathanamthitta' },
  { code: 'KONN-GP', name: 'Konni Grama Panchayat', type: 'Grama Panchayat', district: 'Pathanamthitta' },
  { code: 'TVLA-MUN', name: 'Thiruvalla Municipality', type: 'Municipality', district: 'Pathanamthitta' },
  { code: 'KTYM-MUN', name: 'Kottayam Municipality', type: 'Municipality', district: 'Kottayam' },
  { code: 'PALA-MUN', name: 'Pala Municipality', type: 'Municipality', district: 'Kottayam' },
  { code: 'CHGN-MUN', name: 'Changanassery Municipality', type: 'Municipality', district: 'Kottayam' },
  { code: 'KCHI-CORP', name: 'Kochi Municipal Corporation', type: 'Municipal Corporation', district: 'Ernakulam' },
  { code: 'ALUV-MUN', name: 'Aluva Municipality', type: 'Municipality', district: 'Ernakulam' },
  { code: 'ANGM-MUN', name: 'Angamaly Municipality', type: 'Municipality', district: 'Ernakulam' },
]

export const PLACE_SEEDS: PlaceSeed[] = [
  { name: 'Kunnamthanam', district: 'Pathanamthitta', authorityCode: 'KNM-GP', aliases: ['Kunnamthanam area', 'Kunnamthanam junction'] },
  { name: 'Adoor', district: 'Pathanamthitta', authorityCode: 'ADOR-MUN', aliases: ['Adoor town'] },
  { name: 'Konni', district: 'Pathanamthitta', authorityCode: 'KONN-GP', aliases: ['Konni town'] },
  { name: 'Thiruvalla', district: 'Pathanamthitta', authorityCode: 'TVLA-MUN', aliases: ['Thiruvalla town'] },
  { name: 'Kottayam', district: 'Kottayam', authorityCode: 'KTYM-MUN', aliases: ['Kottayam town', 'Kottayam city'] },
  { name: 'Pala', district: 'Kottayam', authorityCode: 'PALA-MUN', aliases: ['Palai'] },
  { name: 'Changanassery', district: 'Kottayam', authorityCode: 'CHGN-MUN', aliases: ['Changanacherry', 'Changancherry'] },
  { name: 'Kochi', district: 'Ernakulam', authorityCode: 'KCHI-CORP', aliases: ['Cochin', 'Ernakulam city'] },
  { name: 'Aluva', district: 'Ernakulam', authorityCode: 'ALUV-MUN', aliases: ['Alwaye'] },
  { name: 'Angamaly', district: 'Ernakulam', authorityCode: 'ANGM-MUN', aliases: ['Angamali'] },
]

async function seedAuthorities(): Promise<Map<string, string>> {
  const operations: AnyBulkWriteOperation[] = AUTHORITY_SEEDS.map((seed) => ({
    updateOne: {
      filter: { code: seed.code },
      update: {
        $set: {
          name: seed.name,
          type: seed.type,
          district: seed.district,
          isActive: true,
        },
      },
      upsert: true,
    },
  }))

  const result = await Authority.bulkWrite(operations)
  console.log(`Authorities: ${result.upsertedCount} created, ${result.modifiedCount} updated`)

  const authorities = await Authority.find({ code: { $in: AUTHORITY_SEEDS.map((seed) => seed.code) } })
  const authorityIdsByCode = new Map<string, string>()
  for (const authority of authorities) {
    authorityIdsByCode.set(authority.code, authority._id.toString())
  }
  return authorityIdsByCode
}

async function seedPlaces(authorityIdsByCode: Map<string, string>): Promise<void> {
  const operations: AnyBulkWriteOperation[] = PLACE_SEEDS.map((seed) => {
    const authorityId = authorityIdsByCode.get(seed.authorityCode)
    if (!authorityId) {
      throw new Error(`Cannot seed place "${seed.name}": authority "${seed.authorityCode}" is missing`)
    }

    return {
      updateOne: {
        filter: { normalizedName: normalizeName(seed.name), district: seed.district },
        update: {
          $set: {
            name: seed.name,
            normalizedName: normalizeName(seed.name),
            district: seed.district,
            authorityId,
            aliases: seed.aliases.map((alias) => normalizeName(alias)),
            isActive: true,
          },
        },
        upsert: true,
      },
    }
  })

  const result = await Place.bulkWrite(operations)
  console.log(`Places: ${result.upsertedCount} created, ${result.modifiedCount} updated`)
}

export async function printPlaceAuthorityMapping(): Promise<void> {
  type PopulatedAuthority = {
    _id: Types.ObjectId
    name: string
    type: string
    district: string
  }
  type PopulatedPlace = HydratedDocument<PlaceModel> & { authorityId: PopulatedAuthority }

  const places = (await Place.find({ isActive: true }).populate('authorityId', 'name type district').sort({ district: 1, name: 1 })) as unknown as PopulatedPlace[]

  console.log('\nPlace → Authority mapping (dummy demo data):')
  for (const place of places) {
    const authority = place.authorityId
    console.log(
      `  ${place.name} (${place.district}) → ${authority.name} [${authority.type}] | authorityId: ${authority._id} | placeId: ${place._id}`,
    )
  }
}

export async function seedData(): Promise<void> {
  const authorityIdsByCode = await seedAuthorities()
  await seedPlaces(authorityIdsByCode)

  const [authorityCount, placeCount] = await Promise.all([
    Authority.countDocuments(),
    Place.countDocuments(),
  ])
  console.log(`\nTotals — authorities: ${authorityCount}, places: ${placeCount}`)

  await printPlaceAuthorityMapping()
}

export async function runSeed(uri: string): Promise<void> {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env before running the seed script.')
  }

  console.log('Ente Nadu — demo seed')
  console.log('Note: this is demo/seed data for hackathon development, NOT an official Kerala local-body database.\n')

  await connectDatabase()
  if (!isDatabaseConnected()) {
    throw new Error('Could not connect to MongoDB. Check MONGODB_URI in backend/.env.')
  }

  await seedData()

  console.log('\nSeed complete. Running the script again will update existing records without duplicating them.')
  await disconnectDatabase()
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  runSeed(env.mongoUri)
    .catch((err) => {
      console.error('Seed failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(async () => {
      await disconnectDatabase()
    })
}