import mongoose from "mongoose";
const validateMongoId = (id, IdOf) => {
  const isValid = mongoose.Types.ObjectId.isValid(id);

  if (!isValid) throw new Error(`This ${IdOf || ""} ID is not a valid or not found.`);
};
export default validateMongoId;
