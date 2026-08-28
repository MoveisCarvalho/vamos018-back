import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { setup2FA, verify2FA, disable2FA } from '../controllers/twoFactorController';

const router = Router();

// Todas as rotas de 2FA exigem autenticação
router.use(authenticate);

router.post('/setup', setup2FA);
router.post('/verify', verify2FA);
router.post('/disable', disable2FA);

export default router;