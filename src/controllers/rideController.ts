import { Request, Response } from 'express';
import Ride from '../models/Ride';
import User from '../models/User';
import { calculateDistance, calculatePrice } from '../utils/distance';
import { AuthRequest } from '../middlewares/auth';
import mongoose from 'mongoose';
import { io, userSockets } from '../index';

// ============ FUNÇÕES DO CONTROLADOR ============

export const quoteRide = async (req: AuthRequest, res: Response) => {
    try {
        const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;

        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({ message: 'Coordenadas de origem e destino são obrigatórias.' });
        }

        const distance = calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
        const price = calculatePrice(distance);

        res.json({
            distance,
            price,
            distanceKm: (distance / 1000).toFixed(2)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao calcular o preço da corrida.' });
    }
};

export const requestRide = async (req: AuthRequest, res: Response) => {
    try {
        const passengerId = req.userId;
        const { pickupLat, pickupLng, dropoffLat, dropoffLng, pickupAddress, dropoffAddress, distance: providedDistance, price: providedPrice } = req.body;

        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({ message: 'Coordenadas de origem e destino são obrigatórias.' });
        }

        const distance = providedDistance || calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
        const price = providedPrice || calculatePrice(distance);

        const ride = new Ride({
            passengerId: new mongoose.Types.ObjectId(passengerId),
            pickupLocation: { type: 'Point', coordinates: [pickupLng, pickupLat] },
            dropoffLocation: { type: 'Point', coordinates: [dropoffLng, dropoffLat] },
            pickupAddress,
            dropoffAddress,
            distance,
            price,
            status: 'requested',
        });

        await ride.save();

        const rideData = {
            rideId: ride._id,
            pickup: ride.pickupLocation.coordinates,
            dropoff: ride.dropoffLocation.coordinates,
            distance: ride.distance,
            price: ride.price
        };

        // Buscar motoristas online (isAvailable = true)
        const onlineDrivers = await User.find({ role: 'driver', isAvailable: true });
        console.log(`🔍 Motoristas online encontrados: ${onlineDrivers.length}`);

        // Emitir para cada motorista online via socket
        onlineDrivers.forEach(driver => {
            const driverId = driver._id.toString();
            const socketId = userSockets[driverId];
            if (socketId) {
                console.log(`📨 Emitindo para motorista ${driver.name} (${driverId}) via socket ${socketId}`);
                io.to(socketId).emit('new-ride-available', rideData);
            } else {
                console.warn(`⚠️ Motorista ${driver.name} (${driverId}) não tem socket conectado.`);
            }
        });

        res.status(201).json({
            rideId: ride._id,
            distance,
            price,
            status: ride.status,
            message: 'Corrida solicitada com sucesso!'
        });
    } catch (error) {
        console.error('Erro ao solicitar corrida:', error);
        res.status(500).json({ message: 'Erro ao solicitar corrida.' });
    }
};

export const acceptRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.userId;
        const { rideId } = req.params;

        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(403).json({ message: 'Apenas motoristas podem aceitar corridas.' });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Corrida não encontrada.' });

        if (ride.status !== 'requested') {
            return res.status(400).json({ message: 'Esta corrida já foi aceita ou cancelada.' });
        }

        const passenger = await User.findById(ride.passengerId);
        if (!passenger) {
            return res.status(404).json({ message: 'Passageiro não encontrado.' });
        }

        ride.driverId = new mongoose.Types.ObjectId(driverId);
        ride.status = 'accepted';
        await ride.save();

        const driverLocation = driver.location?.coordinates || [0, 0];
        const passengerIdStr = ride.passengerId.toString();

        // Notificar passageiro
        const passengerSocketId = userSockets[passengerIdStr];
        if (passengerSocketId) {
            const message = `${driver.name} aceitou sua corrida e está a caminho!`;
            io.to(passengerSocketId).emit('ride-accepted', {
                rideId: ride._id,
                driverId: driver._id,
                driverName: driver.name,
                driverLocation: {
                    lat: driverLocation[1] || 0,
                    lng: driverLocation[0] || 0
                },
                pickupLocation: {
                    lat: ride.pickupLocation.coordinates[1],
                    lng: ride.pickupLocation.coordinates[0]
                },
                dropoffLocation: {
                    lat: ride.dropoffLocation.coordinates[1],
                    lng: ride.dropoffLocation.coordinates[0]
                },
                message
            });
        }

        // Notificar TODOS os motoristas que esta corrida não está mais disponível
        console.log(`📢 Emitindo ride-unavailable para todos os motoristas: ${rideId}`);
        io.emit('ride-unavailable', { rideId: ride._id });

        // Retornar dados da corrida incluindo o nome do passageiro para o motorista
        res.json({
            message: 'Corrida aceita com sucesso!',
            ride: {
                ...ride.toObject(),
                passengerName: passenger.name
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao aceitar corrida.' });
    }
};

export const startRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.userId;
        const { rideId } = req.params;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Corrida não encontrada.' });

        if (ride.driverId?.toString() !== driverId) {
            return res.status(403).json({ message: 'Você não é o motorista desta corrida.' });
        }

        if (ride.status !== 'accepted') {
            return res.status(400).json({ message: 'Corrida não está no status aceito.' });
        }

        ride.status = 'in_progress';
        await ride.save();

        const passengerIdStr = ride.passengerId.toString();
        const passengerSocketId = userSockets[passengerIdStr];
        if (passengerSocketId) {
            const message = '🚗 Corrida iniciada! Aproveite a viagem.';
            io.to(passengerSocketId).emit('ride-started', {
                rideId: ride._id,
                message
            });
        }

        res.json({ message: 'Corrida em andamento!', ride });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao iniciar corrida.' });
    }
};

export const completeRide = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.userId;
        const { rideId } = req.params;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Corrida não encontrada.' });

        if (ride.driverId?.toString() !== driverId) {
            return res.status(403).json({ message: 'Você não é o motorista desta corrida.' });
        }

        if (ride.status !== 'in_progress') {
            return res.status(400).json({ message: 'Corrida não está em andamento.' });
        }

        ride.status = 'completed';
        ride.paymentStatus = 'paid';
        await ride.save();

        const passengerIdStr = ride.passengerId.toString();
        const passengerSocketId = userSockets[passengerIdStr];
        if (passengerSocketId) {
            const message = '🏁 Corrida finalizada! Obrigado.';
            io.to(passengerSocketId).emit('ride-completed', {
                rideId: ride._id,
                message
            });
        }

        res.json({
            message: 'Corrida finalizada com sucesso! (Pagamento simulado)',
            ride,
            clientSecret: 'simulado_para_teste'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao finalizar corrida.' });
    }
};

export const cancelRide = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { rideId } = req.params;
        const { reason } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Corrida não encontrada.' });

        const isPassenger = ride.passengerId.toString() === userId;
        const isDriver = ride.driverId && ride.driverId.toString() === userId;

        if (!isPassenger && !isDriver) {
            return res.status(403).json({ message: 'Você não tem permissão para cancelar esta corrida.' });
        }

        if (ride.status === 'completed' || ride.status === 'cancelled') {
            return res.status(400).json({ message: 'Esta corrida já foi finalizada ou cancelada.' });
        }

        let cancellationFee = 0;
        if (isPassenger && (ride.status === 'accepted' || ride.status === 'in_progress')) {
            if (reason !== 'justified') {
                cancellationFee = ride.price * 0.5;
            }
        }

        ride.status = 'cancelled';
        ride.cancellationFee = cancellationFee;
        await ride.save();

        const otherUserId = isPassenger ? ride.driverId?.toString() : ride.passengerId.toString();
        if (otherUserId) {
            const otherSocketId = userSockets[otherUserId];
            if (otherSocketId) {
                io.to(otherSocketId).emit('ride-cancelled', {
                    rideId: ride._id,
                    message: `A corrida foi cancelada${cancellationFee > 0 ? ` (taxa de R$ ${cancellationFee.toFixed(2)})` : ''}.`
                });
            }
        }

        io.emit('ride-unavailable', { rideId: ride._id });

        res.json({
            message: 'Corrida cancelada com sucesso!',
            cancellationFee,
            ride
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao cancelar corrida.' });
    }
};

export const toggleDriverAvailability = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.userId;
        const { isAvailable } = req.body;

        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(403).json({ message: 'Apenas motoristas podem alterar a disponibilidade.' });
        }

        driver.isAvailable = isAvailable;
        await driver.save();

        res.json({ message: 'Disponibilidade atualizada!', isAvailable: driver.isAvailable });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao alterar disponibilidade.' });
    }
};

export const getMyRides = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        let filter: any = {};
        if (user.role === 'passenger') filter.passengerId = userId;
        else if (user.role === 'driver') filter.driverId = userId;
        else return res.status(400).json({ message: 'Papel inválido.' });

        const rides = await Ride.find(filter).sort({ createdAt: -1 });
        res.json(rides);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar corridas.' });
    }
};

export const updateDriverLocation = async (req: AuthRequest, res: Response) => {
    try {
        const driverId = req.userId;
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'Latitude e longitude são obrigatórias.' });
        }

        await User.findByIdAndUpdate(driverId, {
            location: { type: 'Point', coordinates: [lng, lat] },
            isAvailable: true
        });

        res.json({ message: 'Localização atualizada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar localização.' });
    }
};