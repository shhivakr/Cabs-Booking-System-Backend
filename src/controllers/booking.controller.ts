import type { Request, Response, NextFunction } from 'express';
import * as bookingService from '../services/booking.service.js';
import { Role } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { ZodError, z } from 'zod';

const uuidSchema = z.string().uuid();

const validateUUID = (id: string) => {
  try {
    uuidSchema.parse(id);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new AppError('Invalid booking ID format', 400);
    }
    throw e;
  }
};

export const createBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = bookingService.createBookingSchema.parse(req.body);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const booking = await bookingService.createBooking(data, user);
    res.status(201).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const getBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = bookingService.bookingQuerySchema.parse(req.query);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const result = await bookingService.getBookings(query, user);
    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};

export const getBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const booking = await bookingService.getBookingById(req.params.id as string, user);
    res.status(200).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const updateBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string);
    const data = bookingService.updateBookingSchema.parse(req.body);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const booking = await bookingService.updateBooking(req.params.id as string, data, user);
    res.status(200).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const assignBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string);
    const data = bookingService.assignBookingSchema.parse(req.body);
    const booking = await bookingService.assignBooking(req.params.id as string, data);
    res.status(200).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const transitionBookingStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string);
    const data = bookingService.transitionBookingSchema.parse(req.body);
    const booking = await bookingService.transitionBookingStatus(req.params.id as string, data);
    res.status(200).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateUUID(req.params.id as string);
    const data = bookingService.cancelBookingSchema.parse(req.body);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const booking = await bookingService.cancelBooking(req.params.id as string, data, user);
    res.status(200).json({
      status: 'success',
      data: booking
    });
  } catch (error) {
    next(error);
  }
};
