import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Authority, Place } from '../src/models/index.js'
import { seedData } from '../src/seeds/seed.js'

let failures = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const mongod = await MongoMemoryServer.create()
const uri = mongod.getUri('ente_nadu_test')

await mongoose.connect(uri)
console.log(`Memory MongoDB ready: ${uri}\n`)

await seedData()
let [authoritiesAfter1st, placesAfter1st] = await Promise.all([
  Authority.countDocuments(),
  Place.countDocuments(),
])
console.log(`\nAfter 1st seed: authorities=${authoritiesAfter1st}, places=${placesAfter1st}`)

await seedData()
let [authoritiesAfter2nd, placesAfter2nd] = await Promise.all([
  Authority.countDocuments(),
  Place.countDocuments(),
])
console.log(`After 2nd seed: authorities=${authoritiesAfter2nd}, places=${placesAfter2nd}\n`)

check('Seed is idempotent (authorities)', authoritiesAfter2nd === authoritiesAfter1st, `${authoritiesAfter1st} → ${authoritiesAfter2nd}`)
check('Seed is idempotent (places)', placesAfter2nd === placesAfter1st, `${placesAfter1st} → ${placesAfter2nd}`)
check('10 authorities seeded', authoritiesAfter2nd === 10, `found ${authoritiesAfter2nd}`)
check('10 places seeded', placesAfter2nd === 10, `found ${placesAfter2nd}`)

const places = await Place.find().populate('authorityId', 'name type district code')
const expected: Array<[string, string, string]> = [
  ['Kunnamthanam', 'Pathanamthitta', 'Kunnamthanam Grama Panchayat'],
  ['Adoor', 'Pathanamthitta', 'Adoor Municipality'],
  ['Konni', 'Pathanamthitta', 'Konni Grama Panchayat'],
  ['Thiruvalla', 'Pathanamthitta', 'Thiruvalla Municipality'],
  ['Kottayam', 'Kottayam', 'Kottayam Municipality'],
  ['Pala', 'Kottayam', 'Pala Municipality'],
  ['Changanassery', 'Kottayam', 'Changanassery Municipality'],
  ['Kochi', 'Ernakulam', 'Kochi Municipal Corporation'],
  ['Aluva', 'Ernakulam', 'Aluva Municipality'],
  ['Angamaly', 'Ernakulam', 'Angamaly Municipality'],
]

let mappingOk = true
for (const [placeName, district, authorityName] of expected) {
  const place = places.find((p) => (p as unknown as { name: string }).name === placeName && (p as unknown as { district: string }).district === district)
  const auth = place?.authorityId as unknown as { name?: string; _id?: unknown } | null
  const placeOk = place !== undefined
  const authOk = placeOk && auth !== null && typeof auth === 'object' && 'name' in auth && auth.name === authorityName
  if (!placeOk || !authOk) {
    mappingOk = false
    console.error(`  mapping issue for ${placeName}/${district} → ${JSON.stringify(auth)}`)
  }
}
check('Every place references its correct authority via authorityId', mappingOk)

const placeObj = places.find((p) => (p as unknown as { name: string }).name === 'Kunnamthanam')
const authorityIdOnPlace = (placeObj?.authorityId as unknown as { _id: unknown })._id
const authorityDoc = await Authority.findOne({ name: 'Kunnamthanam Grama Panchayat' })
check('authorityId is a real Authority _id reference', String(authorityIdOnPlace) === String(authorityDoc?._id))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
await mongoose.disconnect()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)