import { Router } from 'express'
import * as authorityController from '../controllers/authority.controller.js'
import { authenticate, requireRole } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticate, requireRole('authority'))

router.get('/complaints', authorityController.listComplaints)
router.get('/complaints/:complaintId', authorityController.getComplaint)
router.patch('/complaints/:complaintId/status', authorityController.updateStatus)
router.get('/stats', authorityController.getStats)

export default router