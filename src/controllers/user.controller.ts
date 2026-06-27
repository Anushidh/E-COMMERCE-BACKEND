import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { AppError } from '../utils/AppError';
import { changePasswordSchema } from '../validators/auth.validator';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  phone: z.string().optional(),
});

const addressSchema = z.object({
  label: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(1),
  country: z.string().optional(),
  isDefault: z.boolean().optional(),
});

/** Fetches the authenticated user's profile, excluding the password field. */
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('-password');
    if (!user) throw new AppError('User not found', 404);

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/** Updates the user's profile fields (name, phone) and optionally their avatar image. */
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const updateData: any = { ...data };

    // Handle avatar upload
    if (req.file) {
      updateData.avatar = (req.file as any).path;
    }

    const user = await User.findByIdAndUpdate(req.user!.userId, updateData, { new: true }).select('-password');
    if (!user) throw new AppError('User not found', 404);

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * Changes the password for non-OAuth users.
 * Validates the current password before applying the new one.
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await User.findById(req.user!.userId).select('+password');
    if (!user) throw new AppError('User not found', 404);

    if (!user.password) {
      throw new AppError('Cannot change password for OAuth accounts', 400);
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new AppError('Current password is incorrect', 400);

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

// Address management
/**
 * Adds a new delivery address to the user's address list.
 * Automatically sets it as default if it's the first address.
 */
export const addAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = addressSchema.parse(req.body);
    const user = await User.findById(req.user!.userId);
    if (!user) throw new AppError('User not found', 404);

    // If this is the first address or set as default, update others
    if (data.isDefault || user.addresses.length === 0) {
      user.addresses.forEach((addr) => (addr.isDefault = false));
      data.isDefault = true;
    }

    user.addresses.push(data as any);
    await user.save();

    res.status(201).json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

/** Updates an existing delivery address by its ID. */
export const updateAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addressId = req.params.addressId as string;
    const data = addressSchema.partial().parse(req.body);

    const user = await User.findById(req.user!.userId);
    if (!user) throw new AppError('User not found', 404);

    const address = user.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', 404);

    if (data.isDefault) {
      user.addresses.forEach((addr) => (addr.isDefault = false));
    }

    Object.assign(address, data);
    await user.save();

    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

/**
 * Removes a delivery address by ID.
 * If the deleted address was the default, reassigns default to the first remaining address.
 */
export const deleteAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addressId = req.params.addressId as string;

    const user = await User.findById(req.user!.userId);
    if (!user) throw new AppError('User not found', 404);

    const addressIndex = user.addresses.findIndex((a) => a._id?.toString() === addressId);
    if (addressIndex === -1) throw new AppError('Address not found', 404);

    const wasDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);

    // If deleted address was default, set first remaining as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

/** Sets a specific address as the user's default delivery address. */
export const setDefaultAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addressId = req.params.addressId as string;

    const user = await User.findById(req.user!.userId);
    if (!user) throw new AppError('User not found', 404);

    const address = user.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', 404);

    user.addresses.forEach((addr) => (addr.isDefault = false));
    address.isDefault = true;
    await user.save();

    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};
