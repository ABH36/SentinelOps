import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class GatewayModule {}
