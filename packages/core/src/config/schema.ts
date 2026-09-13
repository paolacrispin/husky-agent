import { z } from "zod";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 40-hex-char address");

export const ContactsSchema = z.record(z.string(), addressSchema);

export const TokensSchema = z.record(
  z.string(),
  z.object({
    address: addressSchema,
    decimals: z.number().int().min(0).max(255),
    native: z.boolean().optional(),
  }),
);
