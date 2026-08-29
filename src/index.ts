import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketServer } from 'socket.io';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

import twoFactorRoutes from './routes/twoFactorRoutes';
import authRoutes from './routes/authRoutes';
import rideRoutes from './routes/rideRoutes';
import User from './models/User';

dotenv.config();
console.log('🔑 STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ CARREGADA' : '❌ NÃO ENCONTRADA');

// ===== INICIALIZAÇÃO DO FIREBASE ADMIN =====
let firebaseInitialized = false;

const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (firebaseServiceAccount) {
    try {
        let cleaned = firebaseServiceAccount.replace(/\\n/g, '\n').trim();
        const serviceAccount = JSON.parse(cleaned);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('✅ Firebase Admin inicializado via variável de ambiente.');
    } catch (error) {
        console.error('❌ Erro ao parsear FIREBASE_SERVICE_ACCOUNT:', error);
    }
} else {
    const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
        try {
            const fileContent = fs.readFileSync(localKeyPath, 'utf8');
            const serviceAccount = JSON.parse(fileContent);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin inicializado via arquivo local serviceAccountKey.json');
        } catch (error) {
            console.error('❌ Erro ao carregar serviceAccountKey.json:', error);
        }
    } else {
        console.warn('⚠️  Nenhuma credencial do Firebase encontrada. Login social indisponível.');
    }
}

if (!firebaseInitialized) {
    console.warn('⚠️  Firebase Admin NÃO foi inicializado. As rotas de login social retornarão erro 500.');
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

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use('/api/2fa', twoFactorRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor rodando!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);

// ==================== SOCKET.IO ====================
export const userSockets: { [userId: string]: string } = {}; // EXPORTADO

io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    socket.on('authenticate', (userId: string) => {
        userSockets[userId] = socket.id;
        socket.data.userId = userId;
        console.log(`Usuário ${userId} autenticado no socket (ID: ${socket.id})`);
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

const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;
if (!mongoUri) {
    console.error('❌ Variável MONGO_URI ou MONGO_URL não definida!');
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => {
        console.log('✅ Conectado ao MongoDB Atlas!');
        server.listen(process.env.PORT || 5000, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${process.env.PORT}`);
        });
    })
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));