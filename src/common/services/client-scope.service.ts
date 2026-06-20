import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '../enums';

export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  clientId?: string | number | bigint | null;
}

@Injectable()
export class ClientScopeService {
  resolveClientId(
    user: RequestUser,
    requestedClientId?: string | number | bigint | null,
  ): bigint | undefined {
    if (user.role === UserRole.CLIENT) {
      if (user.clientId == null) {
        throw new ForbiddenException(
          'CLIENT user without associated client',
        );
      }
      return BigInt(user.clientId);
    }

    if (requestedClientId == null || requestedClientId === '') {
      return undefined;
    }
    return BigInt(requestedClientId);
  }

  isClient(user: RequestUser): boolean {
    return user.role === UserRole.CLIENT;
  }
}
