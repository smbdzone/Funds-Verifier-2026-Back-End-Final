import mongoose from 'mongoose'

/**
 * Build a Mongo query that resolves a listing by public uuid or Mongo _id.
 */
export function buildListingIdQuery(id, extra = {}) {
  const clauses = [{ uuid: id }]

  if (mongoose.Types.ObjectId.isValid(id)) {
    clauses.unshift({ _id: id })
  }

  return {
    ...extra,
    $or: clauses,
    isDeleted: false,
  }
}
