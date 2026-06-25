import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from '../enums';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: PermissionAction;
}

export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
