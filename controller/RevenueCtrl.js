import Boat from "../models/boatModel.js";
import Jewelry from "../models/jewelryModel.js";
import Car from "../models/carModel.js";
import Property from "../models/propertyModel.js";
import User from "../models/userModel.js";

export const GetProductsRevenue = async (req, res) => {
  try {
    const SumRevenue = async (Model) => {
      const result = await Model.aggregate([
        { $lookup: { from: "transactions", localField: "transactionId", foreignField: "_id", as: "transactionData" } },
        { $unwind: "$transactionData" },
        { $match: { "transactionData.payment_details.payment_status": "succeeded" } },
        { $group: { _id: null, total: { $sum: "$transactionData.payment_details.amount_total" } }, },
      ]);
      return (result[0]?.total / 100) || 0;
    };

    const servicesTransactionSumResult = await User.aggregate([
      { $lookup: { from: "transactions", localField: "servicesTransaction", foreignField: "_id", as: "servicesTransactionData" } },
      { $unwind: "$servicesTransactionData" },
      { $match: { "servicesTransactionData.payment_details.payment_status": "succeeded" } },
      { $group: { _id: null, total: { $sum: "$servicesTransactionData.payment_details.amount_total" } } },
    ]);

    const totalServicesRevenue = (servicesTransactionSumResult[0]?.total / 100) || 0;

    const [totalBoatRevenue, totalJewelryRevenue, totalCarRevenue, totalPropertyRevenue] = await Promise.all([
      SumRevenue(Boat),
      SumRevenue(Jewelry),
      SumRevenue(Car),
      SumRevenue(Property),
    ]);

    const totalRevenue = totalBoatRevenue + totalJewelryRevenue + totalCarRevenue + totalPropertyRevenue;

    return res.status(200).json({
      totalRevenue,
      totalBoatRevenue,
      totalJewelryRevenue,
      totalCarRevenue,
      totalPropertyRevenue,
      totalServicesRevenue,
    });

  } catch (error) {
    return res.status(500).json({ message: "Failed to calculate revenue", error: error?.message });
  }
};
