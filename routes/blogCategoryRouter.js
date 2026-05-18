import express from 'express'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'
const router = express.Router()

import {
  createCategory,
  updateCategory,
  DeleteCategory,
  getSingleCategory,
  getAllCategory,
} from '../controller/blogCategoryCtrl.js'
import { publicTokenMiddleware } from '../middlewares/publicTokenMiddleware.js'

router.get('/:id', publicTokenMiddleware, getSingleCategory)
router.get('/', publicTokenMiddleware, getAllCategory)
router.post('/', authMiddleware, isAdmin, createCategory)
router.put('/:id', authMiddleware, isAdmin, updateCategory)
router.delete('/:id', authMiddleware, isAdmin, DeleteCategory)

export default router
