import express from 'express'
const router = express.Router()

import {
  createUser,
  getSingleUser,
  getAllUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
  getAllEvaluatorsByParentId,
  AllAssignedAssetstoEvaluator,
  updateSubEvaluatorStatus,
  deleteSubEvaluatorByParent,
} from "../controller/evaluatorCtrl.js";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
import { authorizeUserByUUID } from "../middlewares/authorizeUser.js";
import { validateUUID, validateUserRouteId } from "../middlewares/inputValidation.js";
;
// import { uploadPhoto, productImgResize } from '../middlewares/uploadImgs.js';

// Only Admin or Evaluator can create evaluator profiles (role check in controller)
router.post('/', authMiddleware, createUser)

// Single evaluator profile requires authentication
router.get('/:id', authMiddleware, getSingleUser)

// Get all evaluators requires Admin or Evaluator (role check in controller)
router.get('/', authMiddleware, getAllUser)

router.get(
  '/parent/:parentid',
  authMiddleware,
  authorizeUserByUUID,
  getAllEvaluatorsByParentId
)

router.put(
  '/sub-evaluator/:id/status',
  authMiddleware,
  validateUUID,
  updateSubEvaluatorStatus,
)

router.delete(
  '/sub-evaluator/:id',
  authMiddleware,
  validateUserRouteId,
  deleteSubEvaluatorByParent,
)

router.get(
  '/assigned/:id',
  authMiddleware,
  authorizeUserByUUID,
  AllAssignedAssetstoEvaluator
)

router.put('/update-user/:id', authMiddleware, authorizeUserByUUID, updateUser)

// Block/unblock restricted to Admin or parent evaluator (enforced in controller)
router.put('/block-user/:id', authMiddleware, blockUser)
router.put('/unblock-user/:id', authMiddleware, unblockUser)

// Delete evaluator profile remains Admin-only
router.delete('/delete-user', authMiddleware, isAdmin, deleteUser)

export default router;
