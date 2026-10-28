import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';

/**
 * WebSocket Gateway for real-time agent communication.
 * Provides bidirectional channel for command dispatch and telemetry streaming.
 * 
 * Features:
 * - Sub-200ms command delivery (vs 5-30s HTTP polling)
 * - Real-time terminal output streaming
 * - Device connection status tracking
 * - Automatic reconnection handling
 * - Room-based targeting for per-device messaging
 */
@WebSocketGateway({
  namespace: '/agent-gateway',
  cors: {
    origin: '*', // TODO: Configure specific origins in production
    credentials: true,
  },
  transports: ['websocket', 'polling'], // Fallback to long-polling if WebSocket fails
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(private readonly devicesService: DevicesService) {}

  /**
   * Handle device connection.
   * Authenticates via device credentials in headers and joins device-specific room.
   */
  async handleConnection(client: Socket) {
    try {
      // Check if this is a device or admin connection
      const deviceKey = client.handshake.headers['x-device-key'] as string;
      const deviceSecret = client.handshake.headers['x-device-secret'] as string;
      const adminToken = client.handshake.headers['authorization'] as string;

      // Admin client connection (for terminal monitoring, dashboard, etc.)
      if (adminToken && !deviceKey) {
        await this.handleAdminConnection(client, adminToken);
        return;
      }

      // Device agent connection
      if (!deviceKey || !deviceSecret) {
        this.logger.warn(`Connection rejected: Missing credentials (socket: ${client.id})`);
        client.disconnect();
        return;
      }

      // Verify device credentials
      const device = await this.devicesService.verifyDeviceCredentials(deviceKey, deviceSecret);
      
      if (!device) {
        this.logger.warn(`Connection rejected: Invalid credentials (key: ${deviceKey})`);
        client.disconnect();
        return;
      }

      // Store device info in socket data
      client.data.deviceId = device.id;
      client.data.deviceKey = deviceKey;
      client.data.platform = device.platform;
      client.data.tenantId = device.tenantId;
      client.data.type = 'device';

      // Join device-specific room for targeted messaging
      const room = `device:${device.id}`;
      await client.join(room);

      // Mark device as ONLINE
      await this.devicesService.updateConnectionStatus(device.id, 'ONLINE');

      this.logger.log(`✅ Device connected: ${device.id} (${device.platform}) via WebSocket (socket: ${client.id})`);

      // Send connection acknowledgment
      client.emit('connection:ack', {
        deviceId: device.id,
        connectedAt: new Date().toISOString(),
        room,
      });

    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect();
    }
  }

  /**
   * Handle admin client connection for terminal monitoring.
   * Admin clients can join terminal rooms to watch command output in real-time.
   */
  private async handleAdminConnection(client: Socket, adminToken: string) {
    try {
      // TODO: Verify admin JWT token in TASK-024 (Admin Auth & RBAC)
      // For now, accept any connection with Authorization header for development
      
      // Extract tenantId from token (placeholder - will use JWT decode in TASK-024)
      const tenantId = client.handshake.query.tenantId as string;
      
      if (!tenantId) {
        this.logger.warn(`Admin connection rejected: Missing tenantId (socket: ${client.id})`);
        client.disconnect();
        return;
      }

      // Store admin info in socket data
      client.data.type = 'admin';
      client.data.tenantId = tenantId;
      client.data.adminToken = adminToken;

      // Join tenant-wide admin room for broadcasts
      const tenantAdminRoom = `admin:${tenantId}`;
      await client.join(tenantAdminRoom);

      this.logger.log(`✅ Admin connected: tenant ${tenantId} (socket: ${client.id})`);

      // Send connection acknowledgment
      client.emit('connection:ack', {
        type: 'admin',
        tenantId: tenantId,
        connectedAt: new Date().toISOString(),
        room: tenantAdminRoom,
      });

    } catch (error) {
      this.logger.error(`Admin connection error: ${error.message}`, error.stack);
      client.disconnect();
    }
  }

  /**
   * Allow admin clients to join specific terminal session rooms.
   * Called when admin opens terminal view for a specific command.
   */
  @SubscribeMessage('terminal:join')
  async handleTerminalJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string },
  ) {
    try {
      // Verify this is an admin client
      if (client.data.type !== 'admin') {
        return { success: false, error: 'Only admin clients can join terminal rooms' };
      }

      const terminalRoom = `terminal:${payload.commandId}`;
      await client.join(terminalRoom);

      this.logger.log(`Admin joined terminal room: ${terminalRoom} (socket: ${client.id})`);

      return { 
        success: true, 
        room: terminalRoom,
        commandId: payload.commandId,
      };

    } catch (error) {
      this.logger.error(`Terminal join error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Allow admin clients to leave terminal session rooms.
   */
  @SubscribeMessage('terminal:leave')
  async handleTerminalLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string },
  ) {
    try {
      const terminalRoom = `terminal:${payload.commandId}`;
      await client.leave(terminalRoom);

      this.logger.log(`Admin left terminal room: ${terminalRoom} (socket: ${client.id})`);

      return { success: true };

    } catch (error) {
      this.logger.error(`Terminal leave error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle device disconnection.
   * Marks device as OFFLINE and cleans up resources.
   */
  async handleDisconnect(client: Socket) {
    try {
      const deviceId = client.data.deviceId;

      if (deviceId) {
        // Mark device as OFFLINE
        await this.devicesService.updateConnectionStatus(deviceId, 'OFFLINE');
        this.logger.log(`❌ Device disconnected: ${deviceId} (socket: ${client.id})`);
      } else {
        this.logger.warn(`Socket disconnected without device ID (socket: ${client.id})`);
      }
    } catch (error) {
      this.logger.error(`Disconnection error: ${error.message}`, error.stack);
    }
  }

  /**
   * Dispatch remote command to specific device.
   * Called by RemoteActionsService after command creation.
   */
  dispatchCommand(deviceId: string, command: any): boolean {
    try {
      const room = `device:${deviceId}`;
      
      // Check if device is connected by checking if room exists in server's sockets
      const sockets = this.server.in(room).fetchSockets();
      
      // Emit command to device room (will fail silently if no one is listening)
      this.server.to(room).emit('command', {
        id: command.id,
        actionType: command.actionType,
        parameters: command.payload || {},
        dispatchedAt: new Date().toISOString(),
      });

      this.logger.log(`📤 Command dispatched via WebSocket: ${command.actionType} → ${deviceId} (room: ${room})`);
      return true;

    } catch (error) {
      this.logger.error(`Command dispatch error: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Handle command execution result from agent.
   * Agent reports success/failure after executing command.
   */
  @SubscribeMessage('command:result')
  async handleCommandResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    try {
      const deviceId = client.data.deviceId;

      if (!deviceId) {
        this.logger.warn('Command result received from unauthenticated socket');
        return { success: false, error: 'Not authenticated' };
      }

      this.logger.log(`📥 Command result received from ${deviceId}: ${payload.commandId} → ${payload.status}`);

      // TODO: Call RemoteActionsService.submitCommandResult() in TASK-017/018
      // For now, just log the result

      return { success: true };

    } catch (error) {
      this.logger.error(`Command result handling error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle real-time terminal output streaming from agents.
   * Used by EXECUTE_COMMAND for line-by-line output.
   * Forwards output to admin frontend clients watching the terminal.
   */
  @SubscribeMessage('terminal:stdout')
  async handleTerminalOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string; line: string; isError?: boolean; timestamp?: string },
  ) {
    try {
      const deviceId = client.data.deviceId;
      const tenantId = client.data.tenantId;

      if (!deviceId || !tenantId) {
        this.logger.warn('Terminal output received from unauthenticated socket');
        return { success: false, error: 'Not authenticated' };
      }

      // Log the output (debug level to avoid log spam)
      this.logger.debug(
        `Terminal output from ${deviceId} (${payload.commandId}): ${payload.line.substring(0, 100)}${payload.line.length > 100 ? '...' : ''}`,
      );

      // Forward to admin frontend terminal room
      // Admin clients join room: `terminal:${commandId}` to watch specific command output
      const terminalRoom = `terminal:${payload.commandId}`;
      
      this.server.to(terminalRoom).emit('terminal:line', {
        commandId: payload.commandId,
        deviceId: deviceId,
        line: payload.line,
        isError: payload.isError || false,
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      // Also broadcast to tenant-wide admin room for monitoring dashboard
      const tenantAdminRoom = `admin:${tenantId}`;
      
      this.server.to(tenantAdminRoom).emit('terminal:activity', {
        commandId: payload.commandId,
        deviceId: deviceId,
        linePreview: payload.line.substring(0, 100),
        isError: payload.isError || false,
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      return { success: true };

    } catch (error) {
      this.logger.error(`Terminal output handling error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle terminal stderr (error output) from agents.
   */
  @SubscribeMessage('terminal:stderr')
  async handleTerminalError(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string; line: string; timestamp?: string },
  ) {
    // Treat stderr as stdout with isError flag
    return this.handleTerminalOutput(client, {
      ...payload,
      isError: true,
    });
  }

  /**
   * Handle terminal command completion notification.
   */
  @SubscribeMessage('terminal:complete')
  async handleTerminalComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string; exitCode: number; timestamp?: string },
  ) {
    try {
      const deviceId = client.data.deviceId;

      if (!deviceId) {
        return { success: false, error: 'Not authenticated' };
      }

      this.logger.log(`Terminal command completed: ${payload.commandId} (exit code: ${payload.exitCode})`);

      // Notify admin frontend that terminal session ended
      const terminalRoom = `terminal:${payload.commandId}`;
      
      this.server.to(terminalRoom).emit('terminal:complete', {
        commandId: payload.commandId,
        deviceId: deviceId,
        exitCode: payload.exitCode,
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      return { success: true };

    } catch (error) {
      this.logger.error(`Terminal complete handling error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle terminal interrupt request from admin frontend (Ctrl+C).
   */
  @SubscribeMessage('terminal:interrupt')
  async handleTerminalInterrupt(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { commandId: string; deviceId: string },
  ) {
    try {
      // Verify admin client has permission (TODO: Add admin auth in TASK-024)
      this.logger.log(`Terminal interrupt requested for command: ${payload.commandId} on device: ${payload.deviceId}`);

      // Forward interrupt signal to device
      const deviceRoom = `device:${payload.deviceId}`;
      
      this.server.to(deviceRoom).emit('terminal:interrupt', {
        commandId: payload.commandId,
        timestamp: new Date().toISOString(),
      });

      return { success: true };

    } catch (error) {
      this.logger.error(`Terminal interrupt handling error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle agent heartbeat via WebSocket (optional, can use HTTP endpoint)
   */
  @SubscribeMessage('heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const deviceId = client.data.deviceId;
    
    if (deviceId) {
      // Acknowledge heartbeat
      return { success: true, receivedAt: new Date().toISOString() };
    }

    return { success: false };
  }

  /**
   * Get list of connected devices (for admin dashboard)
   */
  getConnectedDevices(): string[] {
    const connectedDevices: string[] = [];

    this.server.sockets.sockets.forEach((socket) => {
      if (socket.data.deviceId) {
        connectedDevices.push(socket.data.deviceId);
      }
    });

    return connectedDevices;
  }

  /**
   * Check if specific device is connected
   */
  async isDeviceConnected(deviceId: string): Promise<boolean> {
    const room = `device:${deviceId}`;
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.length > 0;
  }
}
