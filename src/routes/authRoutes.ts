import { Router } from 'express';
import { register, login, socialLogin, forgotPassword, resetPassword, getMe } from '../controllers/authController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/social', socialLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Rota protegida para obter dados do usuário
router.get('/me', authenticate, getMe);

export default router;