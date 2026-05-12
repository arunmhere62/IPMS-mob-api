import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface AuthenticatedSocket extends Socket {
  data: {
    userId?: number;
    tenantId?: number;
    pgId?: number;
    organizationId?: number;
    role: 'OWNER' | 'TENANT';
  };
}

@WebSocketGateway({
  namespace: 'tickets',
  cors: { origin: '*' },
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      client.disconnect();
      return;
    }

    // Try owner JWT first, then tenant JWT
    const ownerSecret = this.configService.get<string>('jwt.secret');
    const tenantSecret = this.configService.get<string>('tenantJwt.secret');

    try {
      const payload = this.jwtService.verify(token, { secret: ownerSecret });
      client.data = {
        userId: payload.sub,
        organizationId: payload.organization_id,
        role: 'OWNER',
      };
      this.logger.log(`Owner connected: userId=${payload.sub}`);
      return;
    } catch {
      // not owner token, try tenant
    }

    try {
      const payload = this.jwtService.verify(token, { secret: tenantSecret });
      client.data = {
        tenantId: payload.tenantId,
        pgId: payload.pgId,
        role: 'TENANT',
      };
      this.logger.log(`Tenant connected: tenantId=${payload.tenantId}`);
      return;
    } catch {
      this.logger.warn(`Invalid token — disconnecting client ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_ticket')
  handleJoinTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number },
  ) {
    if (!data?.ticketId) throw new WsException('ticketId is required');
    const room = `ticket-${data.ticketId}`;
    void client.join(room);
    this.logger.log(`${client.id} joined room ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave_ticket')
  handleLeaveTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number },
  ) {
    if (!data?.ticketId) throw new WsException('ticketId is required');
    const room = `ticket-${data.ticketId}`;
    void client.leave(room);
    return { event: 'left', room };
  }

  emitNewComment(ticketId: number, comment: object) {
    this.server.to(`ticket-${ticketId}`).emit('new_comment', comment);
  }

  emitTicketStatusChanged(ticketId: number, status: string) {
    this.server.to(`ticket-${ticketId}`).emit('ticket_status_changed', { ticketId, status });
  }
}
