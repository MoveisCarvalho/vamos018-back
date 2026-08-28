import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    password: string;
    role: 'passenger' | 'driver';
    location?: {
        type: 'Point';
        coordinates: [number, number]; // [longitude, latitude]
    };
    isAvailable?: boolean;
    twoFactorSecret?: string;       // NOVO
    twoFactorEnabled: boolean;      // NOVO
    resetToken?: string;            // NOVO
    resetTokenExpiry?: Date;        // NOVO
    createdAt: Date;
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['passenger', 'driver'], default: 'passenger' },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
    },
    isAvailable: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    twoFactorEnabled: { type: Boolean, default: false },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Índice geoespacial para buscar motoristas próximos
UserSchema.index({ location: '2dsphere' });

export default mongoose.model<IUser>('User', UserSchema);