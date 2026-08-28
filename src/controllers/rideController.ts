import { Request, Response } from 'express';
import Ride from '../models/Ride';
import User from '../models/User';
import { calculateDistance, calculatePrice } from '../utils/distance';
import { AuthRequest } from '../middlewares/auth';
import mongoose from 'mongoose';
import { io } from '../index';

// ============ FUNÇÕES DO CONTROLADOR ============

// [NOVO] Passageiro consulta o preço antes de confirmar
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

// Passageiro solicita uma corrida
export const requestRide = async (req: AuthRequest, res: Response) => {
    try {
        const passengerId = req.userId;
        // [CORREÇÃO] Aceitando os valores vindos do frontend para manter consistência
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
            status: 'requested'
        });

        await ride.save();

        io.emit('new-ride-available', {
            rideId: ride._id,
            pickup: ride.pickupLocation.coordinates,
            dropoff: ride.dropoffLocation.coordinates,
            distance: ride.distance,
            price: ride.price
        });

        res.status(201).json({
            rideId: ride._id,
            distance,
            price,
            status: ride.status,
            message: 'Corrida solicitada com sucesso!'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao solicitar corrida.' });
    }
};

// Motorista aceita uma corrida
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

        ride.driverId = new mongoose.Types.ObjectId(driverId);
        ride.status = 'accepted';
        await ride.save();

        const passengerSocketId = Object.keys(io.sockets.sockets).find(
            (id) => io.sockets.sockets.get(id)?.data?.userId === ride.passengerId.toString()
        );
        if (passengerSocketId) {
            io.to(passengerSocketId).emit('ride-accepted', {
                rideId: ride._id,
                driverId: ride.driverId,
                message: 'Sua corrida foi aceita!'
            });
        }

        res.json({ message: 'Corrida aceita com sucesso!', ride });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao aceitar corrida.' });
    }
};

// Motorista inicia a corrida
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

        res.json({ message: 'Corrida em andamento!', ride });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao iniciar corrida.' });
    }
};

// Finalizar corrida (motorista) - MODO SIMULADO (sem Stripe)
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

// [NOVO] Motorista altera disponibilidade (Online/Offline)
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

// Listar minhas corridas
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

// Atualizar localização do motorista (via REST)
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