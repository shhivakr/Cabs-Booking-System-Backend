import type { Request, Response, NextFunction } from 'express';
import * as customerService from '../services/customer.service.js';

export const listCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = customerService.customerQuerySchema.parse(req.query);
    const result = await customerService.getCustomers(query);
    res.status(200).json({
      status: 'success',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id as string);
    res.status(200).json({
      status: 'success',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

export const createCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = customerService.createCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer(data);
    res.status(201).json({
      status: 'success',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

export const updateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = customerService.updateCustomerSchema.parse(req.body);
    const customer = await customerService.updateCustomer(req.params.id as string, data);
    res.status(200).json({
      status: 'success',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.softDeleteCustomer(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.getMyProfile(req.user!.id as string);
    res.status(200).json({
      status: 'success',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

export const updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = customerService.updateProfileSchema.parse(req.body);
    const customer = await customerService.updateMyProfile(req.user!.id as string, data);
    res.status(200).json({
      status: 'success',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};
