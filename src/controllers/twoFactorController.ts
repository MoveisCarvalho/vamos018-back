import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

// Gerar segredo e QR Code
export const setup2FA = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        const secret = speakeasy.generateSecret({
            name: `Vamos (${user.email})`
        });

        // Salvar segredo (temporário até verificação)
        user.twoFactorSecret = secret.base32;
        await user.save();

        const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

        res.json({
            secret: secret.base32,
            qrCode,
            message: 'Escaneie o QR Code com o Google Authenticator'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao configurar 2FA.' });
    }
};

// Verificar token e ativar 2FA
export const verify2FA = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { token } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (!user.twoFactorSecret) {
            return res.status(400).json({ message: 'Configure o 2FA primeiro.' });
        }

        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token
        });

        if (verified) {
            user.twoFactorEnabled = true;
            await user.save();
            res.json({ message: '2FA ativado com sucesso!' });
        } else {
            res.status(400).json({ message: 'Token inválido.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao verificar 2FA.' });
    }
};

// Desativar 2FA
export const disable2FA = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        user.twoFactorEnabled = false;
        user.twoFactorSecret = undefined;
        await user.save();
        res.json({ message: '2FA desativado.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao desativar 2FA.' });
    }
};

// Função auxiliar para verificar token 2FA (usada no login)
export const verifyTwoFactorCode = async (email: string, token: string): Promise<boolean> => {
    const user = await User.findOne({ email });
    if (!user) return false;
    if (!user.twoFactorEnabled) return true; // se não estiver ativo, passa direto

    if (!user.twoFactorSecret) return false;
    return speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token
    });
};