import { Request, Response } from 'express';
import User, { IUser } from '../models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { verifyTwoFactorCode } from './twoFactorController';
import admin from 'firebase-admin';

// Registrar novo usuário
export const register = async (req: Request, res: Response) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'E-mail já cadastrado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'passenger'
        });

        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });

        res.status(201).json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao registrar usuário.' });
    }
};

// Login
export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Usuário não encontrado.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Senha incorreta.' });
        }

        // Verificar 2FA (se habilitado)
        const twoFactorValid = await verifyTwoFactorCode(email, req.body.twoFactorToken || '');
        if (!twoFactorValid) {
            return res.status(401).json({ message: 'Código 2FA inválido ou necessário.' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });

        console.log(`[LOGIN] Usuário: ${email}, Role no banco: ${user.role}`);

        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao fazer login.' });
    }
};

// ==========================================
// Login Social (Google/Facebook)
// ==========================================
export const socialLogin = async (req: Request, res: Response) => {
    try {
        const { firebaseToken, name, email, role } = req.body;

        if (!firebaseToken) {
            return res.status(400).json({ message: 'Token do Firebase não fornecido.' });
        }

        if (!admin.apps.length) {
            console.error('Firebase Admin NÃO está inicializado.');
            return res.status(500).json({ message: 'Erro de configuração do servidor.' });
        }

        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(firebaseToken);
            console.log('[SOCIAL] Token verificado para:', decodedToken.email);
        } catch (verifyError: any) {
            console.error('Erro ao verificar token Firebase:', verifyError);
            return res.status(401).json({ message: 'Token social inválido ou expirado.' });
        }

        const firebaseEmail = decodedToken.email || email;
        if (!firebaseEmail) {
            return res.status(400).json({ message: 'E-mail não fornecido pelo provedor social.' });
        }

        let user = await User.findOne({ email: firebaseEmail });

        if (!user) {
            const userRole = (role === 'driver' || role === 'passenger') ? role : 'passenger';
            user = new User({
                name: name || firebaseEmail.split('@')[0],
                email: firebaseEmail,
                password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
                role: userRole
            });
            await user.save();
            console.log(`[SOCIAL] Novo usuário criado: ${firebaseEmail}, role: ${userRole}`);
        } else {
            console.log(`[SOCIAL] Usuário existente: ${firebaseEmail}, role atual: ${user.role}`);
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });

        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('Erro no login social:', error);
        res.status(500).json({ message: 'Erro interno no login social.' });
    }
};

// Configurar transporte de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hora

        user.resetToken = resetToken;
        user.resetTokenExpiry = resetTokenExpiry;
        await user.save();

        const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Recuperação de senha - Vamos',
            html: `
        <h1>Recuperação de senha</h1>
        <p>Clique no link abaixo para redefinir sua senha:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Este link expira em 1 hora.</p>
      `
        });

        res.json({ message: 'Email de recuperação enviado!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao enviar email de recuperação.' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token inválido ou expirado.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao redefinir senha.' });
    }
};