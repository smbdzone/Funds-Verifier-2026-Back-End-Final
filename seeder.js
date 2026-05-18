import dbConnection from "./config/dbConnect.js";
import Boat from "./models/boatModel.js";
import Boats from "./data/boat.js";

dbConnection();

const importData = async () => {
  try {
    const res = await Boat.insertMany(Boats);
  } catch (error) {
    console.log(error?.message);
    process.exit(1);
  }
};

const deleteData = async () => {
  try {
    await Boat.deleteMany(Boats);
  } catch (error) {
    console.log(error?.message);
    process.exit(1);
  }
};

if (process.argv[2] === "-import") {
  importData();
} else if (process.argv[2] === "-remove") {
  deleteData();
}
