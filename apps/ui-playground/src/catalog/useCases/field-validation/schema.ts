import { z } from 'zod';
export const createFieldSchema = (required: string) => z.object({ name: z.string().trim().min(1, required) });
