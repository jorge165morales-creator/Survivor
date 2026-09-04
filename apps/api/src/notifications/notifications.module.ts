import { Module } from "@nestjs/common";
import { PushService } from "./push.service";
import { PickReminderSchedulerService } from "./pick-reminder-scheduler.service";

@Module({
  providers: [PushService, PickReminderSchedulerService],
})
export class NotificationsModule {}
