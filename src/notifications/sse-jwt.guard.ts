import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Guard para el endpoint SSE de notificaciones.
 *
 * `EventSource` (navegador) no permite enviar headers personalizados, por lo que
 * el token JWT viaja como query param `?token=`. Este guard lo valida y coloca
 * `request.user` con la misma forma que produce `JwtStrategy.validate`.
 */
@Injectable()
export class SseJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token =
      request.query?.token ||
      (request.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      request.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        clientId: payload.clientId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
