import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "aldrym-server",
      timestamp: new Date().toISOString()
    };
  }
}

