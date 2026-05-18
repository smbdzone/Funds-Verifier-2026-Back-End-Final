import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();
import {
  createUser,
  loginUser,
  getAllUser,
  getSingleUser,
  deleteUser,
  updateUser,
  blockUser,
  unblockUser,
  handleRefreshToken,
  handleLogout,
  updatePassword,
  forgetPasswordToken,
  resetPassword,
  loginAdmin,
  getWishList,
  saveAddress,
  userCart,
  getCart,
  emptyCart,
  applyCoupon,
  createOrder,
  getOrder,
  updateOrderStatus,
} from "../controller/userCtrl.js";

router.post("/", createUser);
router.post("/login", loginUser);
router.post("/login-admin", loginAdmin);
router.get("/all-users", getAllUser);
router.get("/refresh", handleRefreshToken);
router.get("/logout", handleLogout);
router.delete("/empty-cart", authMiddleware, emptyCart);
// router.delete("/:id", deleteUser);
router.post("/forget-password", forgetPasswordToken);
router.put("/reset-password/:token", resetPassword);
router.post("/cart", authMiddleware, userCart);
router.post("/cart/applycoupon", authMiddleware, applyCoupon);
router.post("/cart/cart-order", authMiddleware, createOrder);
router.get("/wishlist", authMiddleware, getWishList);
router.get("/cart", authMiddleware, getCart);
router.get("/get-orders", authMiddleware, getOrder);
router.put("/address", authMiddleware, saveAddress);
router.put("/password", authMiddleware, updatePassword);
router.put("/edit-user", authMiddleware, updateUser);
router.get("/:id", authMiddleware, isAdmin, getSingleUser);
router.put("/block-user/:id", authMiddleware, isAdmin, blockUser);
router.put("/unblock-user/:id", authMiddleware, isAdmin, unblockUser);
router.put(
  "/order/update-order/:id",
  authMiddleware,
  isAdmin,
  updateOrderStatus
);

export default router;
