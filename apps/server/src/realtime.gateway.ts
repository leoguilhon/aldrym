import { WebSocketGateway } from "@nestjs/websockets";

// Placeholder gateway for future real-time gameplay events.
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true
  }
})
export class RealtimeGateway {}

