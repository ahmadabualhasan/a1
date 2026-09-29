import { Module } from '@nestjs/common';
import { NotificationHandlers } from './notification-handlers';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationHandlers], exports: [NotificationsService] })
export class NotificationsModule {}
