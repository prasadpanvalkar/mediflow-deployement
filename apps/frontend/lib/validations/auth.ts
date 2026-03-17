import { z } from 'zod';

export const loginSchema = z.object({
    phone: z
        .string()
        .min(1, "Phone number is required")
        .length(10, "Must be exactly 10 digits")
        .regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
    password: z
        .string()
        .min(1, "Password is required")
        .min(4, "Password must be at least 4 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
