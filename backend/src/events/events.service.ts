import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable, interval, merge } from 'rxjs';
import { map, filter } from 'rxjs/operators';

export interface SentinelRealtimeEvent {
  type: string;
  tenantId?: string;
  deviceId?: string;
  data: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class EventsService {
  private readonly eventSubject = new Subject<SentinelRealtimeEvent>();

  /**
   * Broadcast an event to connected clients
   */
  emit(type: string, payload: { tenantId?: string; deviceId?: string; [key: string]: any }) {
    const { tenantId, deviceId, ...rest } = payload;
    this.eventSubject.next({
      type,
      tenantId,
      deviceId,
      data: rest,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Stream live Server-Sent Events filtered by tenant and optionally by device
   */
  getEventStream(tenantId?: string, deviceId?: string): Observable<MessageEvent> {
    const events$ = this.eventSubject.asObservable().pipe(
      filter((evt) => {
        if (tenantId && evt.tenantId && evt.tenantId !== tenantId) {
          return false;
        }
        if (deviceId && evt.deviceId && evt.deviceId !== deviceId) {
          return false;
        }
        return true;
      }),
      map((evt) => ({
        type: evt.type,
        data: JSON.stringify({
          type: evt.type,
          tenantId: evt.tenantId,
          deviceId: evt.deviceId,
          timestamp: evt.timestamp,
          ...evt.data,
        }),
      } as MessageEvent)),
    );

    // Keepalive heartbeat every 20 seconds
    const keepAlive$ = interval(20000).pipe(
      map(() => ({
        type: 'ping',
        data: JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }),
      } as MessageEvent)),
    );

    return merge(events$, keepAlive$);
  }
}
