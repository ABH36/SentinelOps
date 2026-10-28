import { Controller, Sse, Query, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('stream')
  streamEvents(
    @Query('tenantId') tenantId?: string,
    @Query('deviceId') deviceId?: string,
  ): Observable<MessageEvent> {
    return this.eventsService.getEventStream(tenantId, deviceId);
  }
}
