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
    toggleDriverAvailability,
    cancelRide
} from '../controllers/rideController';

const router = Router();

router.use(authenticate);

router.post('/quote', quoteRide);
router.post('/request', requestRide);
router.put('/driver/availability', toggleDriverAvailability);
router.put('/:rideId/accept', acceptRide);
router.put('/:rideId/start', startRide);
router.put('/:rideId/complete', completeRide);
router.put('/:rideId/cancel', cancelRide); // NOVA ROTA
router.get('/my-rides', getMyRides);
router.post('/driver-location', updateDriverLocation);

export default router;