import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import { createGetListingLocations } from '../utils/listingLocations.js'

export const getPropertyLocations = createGetListingLocations(Property)
export const getCarLocations = createGetListingLocations(Car)
export const getBoatLocations = createGetListingLocations(Boat)
export const getJewelryLocations = createGetListingLocations(Jewelry)
