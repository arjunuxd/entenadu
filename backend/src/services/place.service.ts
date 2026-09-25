import { Authority, Place } from '../models/index.js'
import { normalizeName } from '../utils/normalize.js'

export interface PlaceMatch {
  id: string
  name: string
  district: string
  authorityName: string | null
}

export type ResolvePlaceResult =
  | { status: 'found'; place: PlaceMatch }
  | { status: 'ambiguous'; matches: PlaceMatch[] }
  | { status: 'not_found' }

interface PlaceLookup extends Record<string, unknown> {
  _id: string
  name: string
  district: string
  isActive: boolean
  authorityId: { _id: string; name: string; isActive: boolean } | null
}

export async function resolvePlaceLookup(raw: string, district?: string | null): Promise<PlaceLookup[]> {
  const norm = normalizeName(raw)

  if (!norm) {
    return []
  }

  const filters: unknown[] = [{ normalizedName: norm }, { aliases: norm }]
  const query: Record<string, unknown> = {
    isActive: true,
    $or: filters,
  }

  if (district) {
    query.district = district
  }

  return (await Place.find(query)
    .populate('authorityId', 'name isActive')
    .lean()) as unknown as PlaceLookup[]
}

export async function resolvePlace(raw: string, district?: string | null): Promise<ResolvePlaceResult> {
  const lookups = await resolvePlaceLookup(raw, district)

  if (lookups.length === 0) {
    return { status: 'not_found' }
  }

  const matches: PlaceMatch[] = lookups.map((lookup) => ({
    id: lookup._id.toString(),
    name: lookup.name,
    district: lookup.district,
    authorityName: lookup.authorityId?.isActive ? lookup.authorityId.name : null,
  }))

  if (lookups.length === 1) {
    return { status: 'found', place: matches[0] }
  }

  return { status: 'ambiguous', matches }
}

export interface PlaceView {
  id: string
  name: string
  district: string
  authorityId: string | null
  authorityName: string | null
}

export async function getPlaceView(placeId: string): Promise<PlaceView | null> {
  const lookup = (await Place.findById(placeId)
    .populate('authorityId', 'name isActive')
    .lean()) as unknown as PlaceLookup | null

  if (!lookup) {
    return null
  }

  const authorityActive = Boolean(lookup.authorityId?.isActive)

  return {
    id: lookup._id.toString(),
    name: lookup.name,
    district: lookup.district,
    authorityId: authorityActive && lookup.authorityId ? lookup.authorityId._id.toString() : null,
    authorityName: authorityActive ? lookup.authorityId?.name ?? null : null,
  }
}

export async function getActiveAuthorityId(placeId: string): Promise<string | null> {
  const place = await Place.findById(placeId).select('authorityId').lean()

  if (!place) {
    return null
  }

  const authority = place.authorityId
    ? await Authority.findById(place.authorityId).select('isActive').lean()
    : null

  return authority?.isActive ? authority._id.toString() : null
}