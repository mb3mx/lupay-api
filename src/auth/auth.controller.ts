import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cuenta (queda pendiente de aprobacion)' })
  @ApiResponse({ status: 201, description: 'Cuenta creada' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con Google (idToken del cliente)' })
  async google(@Body() dto: SocialLoginDto): Promise<AuthResponseDto> {
    return this.authService.loginWithGoogle(dto.token);
  }

  @Post('facebook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con Facebook (accessToken del cliente)' })
  async facebook(@Body() dto: SocialLoginDto): Promise<AuthResponseDto> {
    return this.authService.loginWithFacebook(dto.token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos del usuario autenticado (incluye client si aplica)' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  async me(@GetUser() user: { userId: string }) {
    return this.authService.getMe(user.userId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar el token (reemite uno nuevo si la sesión sigue válida)' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async refresh(@GetUser() user: { userId: string }): Promise<AuthResponseDto> {
    return this.authService.refresh(user.userId);
  }
}
