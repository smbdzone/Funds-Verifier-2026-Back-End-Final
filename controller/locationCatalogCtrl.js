import asyncHandler from 'express-async-handler'
import LocationCity from '../models/locationCityModel.js'
import LocationNeighbourhood from '../models/locationNeighbourhoodModel.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'
import { BUILTIN_UAE_CITIES } from '../constants/uaeCities.js'

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const nameKey = (value) => normalizeName(value).toLowerCase()

const cityPublic = (city) => ({
  _id: city._id,
  uuid: city.uuid,
  name: city.name,
  country: city.country,
  isBuiltin: Boolean(city.isBuiltin),
})

const neighbourhoodPublic = (row) => ({
  _id: row._id,
  uuid: row.uuid,
  name: row.name,
  cityId: row.city?._id || row.city,
  cityName: row.cityName || row.city?.name || '',
})

let builtinsReady = false

async function ensureBuiltinCities() {
  if (builtinsReady) return
  for (const name of BUILTIN_UAE_CITIES) {
    const key = nameKey(name)
    const existing = await LocationCity.findOne({ nameNormalized: key })
    if (existing) {
      if (existing.isDeleted || !existing.isBuiltin) {
        existing.isDeleted = false
        existing.deletedAt = null
        existing.isBuiltin = true
        existing.name = name
        existing.nameNormalized = key
        await existing.save()
      }
      continue
    }
    try {
      await LocationCity.create({
        name,
        nameNormalized: key,
        country: 'United Arab Emirates',
        isBuiltin: true,
      })
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }
  builtinsReady = true
}

export const listPublicCities = asyncHandler(async (_req, res) => {
  await ensureBuiltinCities()
  const cities = await LocationCity.find({ isDeleted: false })
    .sort({ isBuiltin: -1, name: 1 })
    .lean()
  res.json({ cities: cities.map(cityPublic) })
})

export const listPublicNeighbourhoods = asyncHandler(async (req, res) => {
  const cityName = normalizeName(req.query.city)
  const cityId = sanitizeMongoId(req.query.cityId)

  const filter = { isDeleted: false }
  if (cityId) {
    filter.city = cityId
  } else if (cityName) {
    filter.cityName = new RegExp(
      `^${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i',
    )
  } else {
    return res.status(400).json({ message: 'city or cityId is required' })
  }

  const rows = await LocationNeighbourhood.find(filter).sort({ name: 1 }).lean()
  res.json({ neighbourhoods: rows.map(neighbourhoodPublic) })
})

export const listAdminCities = asyncHandler(async (_req, res) => {
  await ensureBuiltinCities()
  const cities = await LocationCity.find({ isDeleted: false })
    .sort({ isBuiltin: -1, name: 1 })
    .lean()
  res.json({ cities: cities.map(cityPublic) })
})

export const createCity = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name)
  if (!name) {
    return res.status(400).json({ message: 'City name is required' })
  }
  if (name.length > 80) {
    return res.status(400).json({ message: 'City name is too long' })
  }

  const key = nameKey(name)
  const existing = await LocationCity.findOne({ nameNormalized: key })
  if (existing && !existing.isDeleted) {
    return res.status(409).json({ message: 'This city already exists' })
  }
  if (existing && existing.isDeleted) {
    existing.name = name
    existing.nameNormalized = key
    existing.isDeleted = false
    existing.deletedAt = null
    await existing.save()
    return res.status(201).json({ city: cityPublic(existing) })
  }

  try {
    const city = await LocationCity.create({
      name,
      nameNormalized: key,
      country: 'United Arab Emirates',
    })
    res.status(201).json({ city: cityPublic(city) })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'This city already exists' })
    }
    throw error
  }
})

export const updateCity = asyncHandler(async (req, res) => {
  const id = sanitizeMongoId(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid city id' })

  const name = normalizeName(req.body?.name)
  if (!name) {
    return res.status(400).json({ message: 'City name is required' })
  }

  const city = await LocationCity.findOne({ _id: id, isDeleted: false })
  if (!city) return res.status(404).json({ message: 'City not found' })
  if (city.isBuiltin) {
    return res.status(400).json({
      message: 'Built-in cities cannot be renamed. Add an extra city instead.',
    })
  }

  const key = nameKey(name)
  const clash = await LocationCity.findOne({
    nameNormalized: key,
    isDeleted: false,
    _id: { $ne: city._id },
  })
  if (clash) {
    return res.status(409).json({ message: 'This city already exists' })
  }

  const previousName = city.name
  city.name = name
  city.nameNormalized = key
  await city.save()

  if (previousName !== name) {
    await LocationNeighbourhood.updateMany(
      { city: city._id, isDeleted: false },
      { $set: { cityName: name } },
    )
  }

  res.json({ city: cityPublic(city) })
})

export const deleteCity = asyncHandler(async (req, res) => {
  const id = sanitizeMongoId(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid city id' })

  const city = await LocationCity.findOne({ _id: id, isDeleted: false })
  if (!city) return res.status(404).json({ message: 'City not found' })
  if (city.isBuiltin) {
    return res.status(400).json({ message: 'Built-in cities cannot be deleted.' })
  }

  city.isDeleted = true
  city.deletedAt = new Date()
  await city.save()

  await LocationNeighbourhood.updateMany(
    { city: city._id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  )

  res.json({ message: 'City deleted' })
})

export const listAdminNeighbourhoods = asyncHandler(async (req, res) => {
  await ensureBuiltinCities()
  const cityId = sanitizeMongoId(req.query.cityId)
  const filter = { isDeleted: false }
  if (cityId) filter.city = cityId

  const rows = await LocationNeighbourhood.find(filter)
    .populate('city', 'name')
    .sort({ cityName: 1, name: 1 })
    .lean()

  res.json({ neighbourhoods: rows.map(neighbourhoodPublic) })
})

export const createNeighbourhood = asyncHandler(async (req, res) => {
  await ensureBuiltinCities()
  const name = normalizeName(req.body?.name)
  const cityId = sanitizeMongoId(req.body?.cityId)
  if (!name) {
    return res.status(400).json({ message: 'Neighbourhood name is required' })
  }
  if (name.length > 120) {
    return res.status(400).json({ message: 'Neighbourhood name is too long' })
  }
  if (!cityId) {
    return res.status(400).json({ message: 'City is required' })
  }

  const city = await LocationCity.findOne({ _id: cityId, isDeleted: false })
  if (!city) return res.status(404).json({ message: 'City not found' })

  const key = nameKey(name)
  const existing = await LocationNeighbourhood.findOne({
    city: city._id,
    nameNormalized: key,
  })
  if (existing && !existing.isDeleted) {
    return res
      .status(409)
      .json({ message: 'This neighbourhood already exists for that city' })
  }
  if (existing && existing.isDeleted) {
    existing.name = name
    existing.nameNormalized = key
    existing.cityName = city.name
    existing.isDeleted = false
    existing.deletedAt = null
    await existing.save()
    return res.status(201).json({ neighbourhood: neighbourhoodPublic(existing) })
  }

  try {
    const row = await LocationNeighbourhood.create({
      name,
      nameNormalized: key,
      city: city._id,
      cityName: city.name,
    })
    res.status(201).json({ neighbourhood: neighbourhoodPublic(row) })
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: 'This neighbourhood already exists for that city' })
    }
    throw error
  }
})

export const updateNeighbourhood = asyncHandler(async (req, res) => {
  const id = sanitizeMongoId(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid neighbourhood id' })

  const row = await LocationNeighbourhood.findOne({
    _id: id,
    isDeleted: false,
  })
  if (!row) return res.status(404).json({ message: 'Neighbourhood not found' })

  const name = normalizeName(req.body?.name || row.name)
  const cityId = sanitizeMongoId(req.body?.cityId) || String(row.city)

  const city = await LocationCity.findOne({ _id: cityId, isDeleted: false })
  if (!city) return res.status(404).json({ message: 'City not found' })

  const key = nameKey(name)
  const clash = await LocationNeighbourhood.findOne({
    city: city._id,
    nameNormalized: key,
    isDeleted: false,
    _id: { $ne: row._id },
  })
  if (clash) {
    return res
      .status(409)
      .json({ message: 'This neighbourhood already exists for that city' })
  }

  row.name = name
  row.nameNormalized = key
  row.city = city._id
  row.cityName = city.name
  await row.save()

  res.json({ neighbourhood: neighbourhoodPublic(row) })
})

export const deleteNeighbourhood = asyncHandler(async (req, res) => {
  const id = sanitizeMongoId(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid neighbourhood id' })

  const row = await LocationNeighbourhood.findOne({
    _id: id,
    isDeleted: false,
  })
  if (!row) return res.status(404).json({ message: 'Neighbourhood not found' })

  row.isDeleted = true
  row.deletedAt = new Date()
  await row.save()

  res.json({ message: 'Neighbourhood deleted' })
})
