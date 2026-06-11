import {
  Controller,
  Get,
  Query,
  Sse,
  UseGuards,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SseJwtGuard } from './sse-jwt.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List recent notifications for the current user' })
  async findAll(@GetUser('userId') userId: string) {
    // Devolvemos el array directo: el TransformInterceptor global lo envuelve
    // como { success: true, data: [...] }.
    return this.notificationsService.listForUser(userId);
  }

  @Sse('stream')
  @UseGuards(SseJwtGuard)
  @ApiOperation({ summary: 'Real-time notifications stream (SSE)' })
  stream(@GetUser('userId') userId: string): Observable<MessageEvent> {
    return this.notificationsService.streamForUser(userId);
  }
}
