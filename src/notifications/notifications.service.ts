import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { FileControl, FileStatus } from '@prisma/client';

export interface NotificationDetails {
  recordsProcessed: number;
  recordsInserted: number;
  recordsDuplicated: number;
  recordsConflicts: number;
  conflictsSample: any[];
  autoReconciliation: {
    matched: number;
    amountMismatch: number;
    notFound: number;
  } | null;
  errorMessage: string | null;
}

export interface AppNotification {
  id: string;
  fileType: string;
  originalName: string;
  status: string;
  message: string;
  time: string;
  details: NotificationDetails;
}

interface UserEvent {
  userId: string;
  notification: AppNotification;
}

@Injectable()
export class NotificationsService {
  private readonly events$ = new Subject<UserEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /** Emite una notificación en tiempo real hacia un usuario (vía SSE). */
  emit(userId: string | bigint, notification: AppNotification): void {
    this.events$.next({ userId: String(userId), notification });
  }

  /** Stream SSE filtrado por usuario. */
  streamForUser(userId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((e) => e.userId === String(userId)),
      map((e) => ({ data: e.notification }) as MessageEvent),
    );
  }

  /**
   * Lista las notificaciones recientes del usuario, derivadas de los
   * registros FileControl que cargó (poblado inicial / sobrevive recargas).
   */
  async listForUser(
    userId: string,
    limit = 20,
  ): Promise<AppNotification[]> {
    const files = await this.prisma.fileControl.findMany({
      where: { uploadedBy: BigInt(userId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return files.map((f) => NotificationsService.toNotification(f));
  }

  /** Construye la notificación a partir de un FileControl. */
  static toNotification(fc: FileControl): AppNotification {
    const rd: any = (fc as any).resultDetails ?? {};
    const details: NotificationDetails = {
      recordsProcessed: fc.processedCount ?? rd.recordsProcessed ?? 0,
      recordsInserted: fc.insertedCount ?? rd.recordsInserted ?? 0,
      recordsDuplicated: fc.duplicateCount ?? rd.recordsDuplicated ?? 0,
      recordsConflicts: fc.conflictCount ?? rd.recordsConflicts ?? 0,
      conflictsSample: rd.conflictsSample ?? [],
      autoReconciliation: rd.autoReconciliation ?? null,
      errorMessage: fc.errorMessage ?? null,
    };

    let message: string;
    if (fc.status === FileStatus.COMPLETED) {
      message = `${fc.originalName} ha finalizado su procesamiento`;
    } else if (fc.status === FileStatus.ERROR) {
      message = `Error al procesar ${fc.originalName}`;
    } else {
      message = `${fc.originalName} en proceso…`;
    }

    return {
      id: String(fc.id),
      fileType: fc.fileType,
      originalName: fc.originalName,
      status: fc.status,
      message,
      time: (fc.processedAt ?? fc.createdAt).toISOString(),
      details,
    };
  }
}
