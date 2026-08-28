import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketServer } from 'socket.io';
import mongoose from 'mongoose';
import admin from 'firebase-admin';

// Import das Rotas
import twoFactorRoutes from './routes/twoFactorRoutes';
import authRoutes from './routes/authRoutes';
import rideRoutes from './routes/rideRoutes';

// Import do modelo para o Socket
import User from './models/User';

dotenv.config();
console.log('🔑 STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ CARREGADA' : '❌ NÃO ENCONTRADA');

// ===== INICIALIZAÇÃO SEGURA DO FIREBASE ADMIN =====
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin inicializado com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao parsear FIREBASE_SERVICE_ACCOUNT:', error);
    }
} else {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT não definida. Login social (Google/Facebook) estará indisponível.');
}

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middlewares
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use('/api/2fa', twoFactorRoutes);

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor Uber rodando!' });
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);

// ==================== SOCKET.IO ====================
const userSockets: { [userId: string]: string } = {};

io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    socket.on('authenticate', (userId: string) => {
        userSockets[userId] = socket.id;
        socket.data.userId = userId;
        console.log(`Usuário ${userId} autenticado no socket`);
    });

    socket.on('driver-location', async (data: { driverId: string, lat: number, lng: number }) => {
        const { driverId, lat, lng } = data;
        await User.findByIdAndUpdate(driverId, {
            location: {
                type: 'Point',
                coordinates: [lng, lat]
            },
            isAvailable: true
        });
        socket.broadcast.emit('driver-location-update', { driverId, lat, lng });
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        for (const [userId, socketId] of Object.entries(userSockets)) {
            if (socketId === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

export { io };

// Conectar ao MongoDB e subir servidor
mongoose.connect(process.env.MONGO_URI as string)
    .then(() => {
        console.log('✅ Conectado ao MongoDB Atlas!');
        server.listen(process.env.PORT || 5000, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${process.env.PORT}`);
        });
    })
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));