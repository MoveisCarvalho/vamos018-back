import mongoose, { Schema, Document } from 'mongoose';

export interface IRide extends Document {
    passengerId: mongoose.Types.ObjectId;
    driverId?: mongoose.Types.ObjectId;
    status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
    pickupLocation: {
        type: 'Point';
        coordinates: [number, number]; // [longitude, latitude]
    };
    dropoffLocation: {
        type: 'Point';
        coordinates: [number, number];
    };
    pickupAddress?: string;
    dropoffAddress?: string;
    distance: number; // em metros
    price: number; // em reais (R$)
    paymentIntentId?: string; // ID do Stripe PaymentIntent
    paymentStatus: 'pending' | 'paid' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

const RideSchema = new Schema<IRide>(
    {
        passengerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        driverId: { type: Schema.Types.ObjectId, ref: 'User' },
        status: {
            type: String,
            enum: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled'],
            default: 'requested'
        },
        pickupLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true }
        },
        dropoffLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true }
        },
        pickupAddress: { type: String },
        dropoffAddress: { type: String },
        distance: { type: Number, required: true },
        price: { type: Number, required: true },
        paymentIntentId: { type: String },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed'],
            default: 'pending'
        }
    },
    { timestamps: true }
);

// Índice geoespacial para buscar corridas próximas
RideSchema.index({ pickupLocation: '2dsphere' });

export default mongoose.model<IRide>('Ride', RideSchema);