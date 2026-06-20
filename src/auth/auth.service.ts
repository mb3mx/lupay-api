import {
  Injectable,
  UnauthorizedException,
  Logger,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserRole } from '../common/enums';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  clientId?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(`Login attempt for non-existent user: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Esta cuenta usa login con Google/Facebook',
      );
    }

    if (!user.isActive) {
      this.logger.warn(`Login attempt for inactive user: ${email}`);
      throw new ForbiddenException({
        code: 'PENDING_APPROVAL',
        message: 'Cuenta pendiente de aprobacion por un administrador',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Failed login attempt for user: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async register(dto: RegisterDto): Promise<{ message: string; userId: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El correo ya esta registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: 'USER',
      isActive: false,
      provider: 'local',
    });

    this.logger.log(`New signup pending approval: ${user.email} (id=${user.id})`);

    return {
      message: 'Cuenta creada. Un administrador debe aprobarla antes de ingresar.',
      userId: String(user.id),
    };
  }

  async loginWithGoogle(idToken: string): Promise<AuthResponseDto> {
    let payload: any;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google idToken verify failed: ${err?.message}`);
      throw new UnauthorizedException('Token de Google invalido');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Google no devolvio correo');
    }

    return this.upsertSocialUser(
      'google',
      payload.sub,
      payload.email,
      payload.given_name ?? 'Usuario',
      payload.family_name ?? 'Google',
      payload.picture ?? null,
    );
  }

  async loginWithFacebook(accessToken: string): Promise<AuthResponseDto> {
    const fields = 'id,email,first_name,last_name,picture.type(large)';
    const url = `https://graph.facebook.com/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

    let data: any;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Facebook graph respondio ${res.status}`);
      }
      data = await res.json();
    } catch (err) {
      this.logger.warn(`Facebook token verify failed: ${err?.message}`);
      throw new UnauthorizedException('Token de Facebook invalido');
    }

    if (!data?.email) {
      throw new UnauthorizedException(
        'Facebook no devolvio correo. Verifica permisos del scope email.',
      );
    }

    return this.upsertSocialUser(
      'facebook',
      data.id,
      data.email,
      data.first_name ?? 'Usuario',
      data.last_name ?? 'Facebook',
      data.picture?.data?.url ?? null,
    );
  }

  private async upsertSocialUser(
    provider: 'google' | 'facebook',
    providerId: string,
    email: string,
    firstName: string,
    lastName: string,
    avatarUrl: string | null,
  ): Promise<AuthResponseDto> {
    let user = await this.usersService.findByProvider(provider, providerId);

    if (!user) {
      // Linkear cuenta local existente con el mismo correo
      const byEmail = await this.usersService.findByEmail(email);
      if (byEmail) {
        user = await this.usersService.update(byEmail.id, {
          provider,
          providerId,
          avatarUrl: byEmail.avatarUrl ?? avatarUrl,
        });
      } else {
        user = await this.usersService.create({
          email,
          firstName,
          lastName,
          role: 'USER',
          isActive: false,
          provider,
          providerId,
          avatarUrl,
        });
        this.logger.log(
          `New social signup pending approval: ${email} via ${provider} (id=${user.id})`,
        );
      }
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'PENDING_APPROVAL',
        message: 'Cuenta pendiente de aprobacion por un administrador',
      });
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: any): AuthResponseDto {
    const clientIdStr = user.clientId != null ? String(user.clientId) : null;
    const payload: JwtPayload = {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      clientId: clientIdStr,
    };
    const accessToken = this.jwtService.sign(payload);
    this.logger.log(`User logged in: ${user.email}`);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as UserRole,
        avatarUrl: user.avatarUrl ?? null,
        clientId: clientIdStr,
      },
    };
  }

  /**
   * Reemite un token nuevo para un usuario que aún tiene sesión válida.
   * Lo usa el endpoint /auth/refresh (protegido por JwtAuthGuard): el aviso de
   * expiración se dispara antes de vencer, así que el token actual sigue siendo
   * válido y el guard permite la renovación.
   */
  async refresh(userId: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findByIdWithClient(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }
    return this.buildAuthResponse(user);
  }

  async validateUser(userId: string): Promise<any> {
    return this.usersService.findById(userId);
  }

  async getMe(userId: string) {
    const user = await this.usersService.findByIdWithClient(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: String(user.id),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl ?? null,
      clientId: user.clientId != null ? String(user.clientId) : null,
      client: (user as any).client
        ? {
            id: String((user as any).client.id),
            code: (user as any).client.code,
            name: (user as any).client.name,
            businessName: (user as any).client.businessName,
            taxId: (user as any).client.taxId,
            isActive: (user as any).client.isActive,
          }
        : null,
    };
  }
}
