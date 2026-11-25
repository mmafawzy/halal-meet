import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
  type PipeTransform,
  SetMetadata,
} from '@nestjs/common';
import type { z } from 'zod';

/** Validates a request body/query with a zod schema. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) {
      throw new BadRequestException({
        error: 'validation_error',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const IS_PUBLIC = 'isPublic';
/** Marks a route as not requiring a JWT. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest {
  accountId?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** The authenticated account id. */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.accountId) throw new Error('UserId used on a public route');
  return req.accountId;
});
