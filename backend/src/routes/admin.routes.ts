import { Router } from 'express'
import * as adminController from '../controllers/admin.controller.js'
import { authenticate, requireRole } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get('/complaints', adminController.listComplaints)
router.get('/complaints/:complaintId', adminController.getComplaint)
router.patch('/complaints/:complaintId/verify', adminController.verify)
router.patch('/complaints/:complaintId/reject', adminController.reject)
router.patch('/complaints/:complaintId/assign', adminController.assign)
router.patch('/complaints/:complaintId/reassign', adminController.reassign)
router.get('/authorities', adminController.listAuthorities)
router.get('/authority-users', adminController.listAuthorityUsers)
router.patch('/authority-users/:userId/access', adminController.updateAuthorityUser)
router.get('/stats', adminController.getStats)

export default router