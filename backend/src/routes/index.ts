import { Router } from 'express'
import adminRouter from './admin.routes.js'
import authRouter from './auth.routes.js'
import authorityRouter from './authority.routes.js'
import healthRouter from './health.routes.js'

const router = Router()

router.use('/health', healthRouter)
router.use('/auth', authRouter)
router.use('/admin', adminRouter)
router.use('/authority', authorityRouter)

export default router