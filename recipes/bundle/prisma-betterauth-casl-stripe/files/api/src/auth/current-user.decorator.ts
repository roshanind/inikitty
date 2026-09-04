import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';

/**
 * Returns the authenticated user for the current request. @thallesp/nestjs-better-auth's global
 * AuthGuard sets `request.session` (containing `.user`) before any handler runs — mirrors that
 * package's own `Session()` decorator, just drilling one level further to the user. There's no
 * global Express.Request type augmentation shipped for this, hence the explicit cast here.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserSession['user'] | null => {
    const request = ctx.switchToHttp().getRequest<Request & { session?: UserSession | null }>();
    return request.session?.user ?? null;
  },
);
