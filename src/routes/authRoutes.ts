import { Router } from 'express';
import { register, login, socialLogin, forgotPassword, resetPassword } from '../controllers/authController';

const router = Router();

// Rotas públicas (não precisam de token)
router.post('/register', register);
router.post('/login', login);
router.post('/social', socialLogin); // <--- AQUI! Rota para o login do Google
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;