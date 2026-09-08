import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { AssignAssetToEvaluator } from '../controller/AssignAssetsCtrl.js'

const router = express.Router()

// Parent Evaluators assign assets to their Sub-Evaluators; Admin may also assign.
router.post('/', authMiddleware, AssignAssetToEvaluator)

export default router
