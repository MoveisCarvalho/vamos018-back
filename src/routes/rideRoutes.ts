import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
    quoteRide,
    requestRide,
    acceptRide,
    startRide,
    completeRide,
    getMyRides,
    updateDriverLocation,
    toggleDriverAvailability // NOVO
} from '../controllers/rideController';

const router = Router();

// Todas as rotas de corrida exigem autenticação
router.use(authenticate);

// Passageiro consulta preço
router.post('/quote', quoteRide);

// Passageiro solicita corrida
router.post('/request', requestRide);

// [NOVO] Motorista altera disponibilidade
router.put('/driver/availability', toggleDriverAvailability);

// Motorista aceita corrida
router.put('/:rideId/accept', acceptRide);

// Motorista inicia corrida
router.put('/:rideId/start', startRide);

// Motorista finaliza corrida (gera PaymentIntent)
router.put('/:rideId/complete', completeRide);

// Listar minhas corridas (passageiro ou motorista)
router.get('/my-rides', getMyRides);

// Atualizar localização do motorista (via REST, mas usaremos Socket também)
router.post('/driver-location', updateDriverLocation);

export default router;