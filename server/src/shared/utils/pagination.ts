import { z } from "zod";

export const defaultPageSize = 20;
export const maximumPageSize = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(maximumPageSize).optional(),
});

export type PaginationInput = { page: number; limit: number };

export const paginationMetadataSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(maximumPageSize),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginationMetadata = z.infer<typeof paginationMetadataSchema>;

export function createPaginationMetadata(page: number, limit: number, total: number): PaginationMetadata {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: total > 0 && page > 1,
  };
}

export function normalizedPagination(input: { page?: number; limit?: number }): PaginationInput {
  return {
    page: input.page ?? 1,
    limit: input.limit ?? defaultPageSize,
  };
}
