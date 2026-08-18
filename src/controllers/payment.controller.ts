import type { Request, Response, NextFunction } from 'express';
import * as paymentService from '../services/payment.service.js';
import { Role } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { ZodError, z } from 'zod';

const uuidSchema = z.string().uuid();

const validateUUID = (id: string, label = 'ID') => {
  try {
    uuidSchema.parse(id);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new AppError(`Invalid ${label} format`, 400);
    }
    throw e;
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/bookings/:bookingId/payments
// ---------------------------------------------------------------------------
export const createPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.bookingId as string, 'booking ID');
    const data = paymentService.createPaymentSchema.parse(req.body);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const payment = await paymentService.createPayment(req.params.bookingId as string, data, user);
    res.status(201).json({
      status: 'success',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/bookings/:bookingId/payments
// ---------------------------------------------------------------------------
export const getPaymentsForBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.bookingId as string, 'booking ID');
    const query = paymentService.paymentQuerySchema.parse(req.query);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const result = await paymentService.getPaymentsForBooking(
      req.params.bookingId as string,
      query,
      user
    );
    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/payments/:id
// ---------------------------------------------------------------------------
export const getPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string, 'payment ID');
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const payment = await paymentService.getPaymentById(req.params.id as string, user);
    res.status(200).json({
      status: 'success',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};
