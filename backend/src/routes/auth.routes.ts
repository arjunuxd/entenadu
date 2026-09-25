import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import {
  adminOnlyTest,
  authorityOnlyTest,
  login,
  logout,
  me,
  protectedTest,
} from '../controllers/auth.controller.js'
import { authenticate, requireRole } from '../middleware/auth.middleware.js'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 20

const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
})

const router = Router()

router.post('/login', loginLimiter, login)
router.get('/me', authenticate, me)
router.post('/logout', logout)

if (!env.isProduction) {
  router.get('/protected-test', authenticate, protectedTest)
  router.get('/admin-test', authenticate, requireRole('admin'), adminOnlyTest)
  router.get('/authority-test', authenticate, requireRole('authority'), authorityOnlyTest)
}

export default router