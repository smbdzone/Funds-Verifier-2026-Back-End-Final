import express from 'express'
import { adminOnly } from '../middlewares/adminOnly.js'
import { validateStringLength } from '../middlewares/inputValidation.js'
import {
  listPublicCountries,
  listPublicCities,
  listPublicNeighbourhoods,
  listAdminCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  listAdminCities,
  createCity,
  updateCity,
  deleteCity,
  listAdminNeighbourhoods,
  createNeighbourhood,
  updateNeighbourhood,
  deleteNeighbourhood,
} from '../controller/locationCatalogCtrl.js'

const router = express.Router()

router.get('/countries', listPublicCountries)
router.get('/cities', listPublicCities)
router.get('/neighbourhoods', listPublicNeighbourhoods)

router.get('/admin/countries', ...adminOnly, listAdminCountries)
router.post(
  '/admin/countries',
  ...adminOnly,
  validateStringLength('name', 80, 1),
  createCountry,
)
router.put(
  '/admin/countries/:id',
  ...adminOnly,
  validateStringLength('name', 80, 1),
  updateCountry,
)
router.delete('/admin/countries/:id', ...adminOnly, deleteCountry)

router.get('/admin/cities', ...adminOnly, listAdminCities)
router.post(
  '/admin/cities',
  ...adminOnly,
  validateStringLength('name', 80, 1),
  createCity,
)
router.put(
  '/admin/cities/:id',
  ...adminOnly,
  validateStringLength('name', 80, 1),
  updateCity,
)
router.delete('/admin/cities/:id', ...adminOnly, deleteCity)

router.get('/admin/neighbourhoods', ...adminOnly, listAdminNeighbourhoods)
router.post(
  '/admin/neighbourhoods',
  ...adminOnly,
  validateStringLength('name', 120, 1),
  createNeighbourhood,
)
router.put(
  '/admin/neighbourhoods/:id',
  ...adminOnly,
  validateStringLength('name', 120, 1),
  updateNeighbourhood,
)
router.delete('/admin/neighbourhoods/:id', ...adminOnly, deleteNeighbourhood)

export default router
