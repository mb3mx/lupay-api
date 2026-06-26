import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../common/decorators/require-permission.decorator';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) {
      throw new ForbiddenException('No role information on request');
    }

    const allowed = await this.permissionsService.isAllowed(
      required.resource,
      required.action,
      user.role,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Role ${user.role} no tiene permiso ${required.action} sobre ${required.resource}`,
      );
    }
    return true;
  }
}
