import { Injectable } from '@nestjs/common';
import type {
  MailDelivery,
  MailDeliveryRepository,
} from './mail-delivery.repository.js';

@Injectable()
export class InMemoryMailDeliveryRepository implements MailDeliveryRepository {
  private readonly deliveries: MailDelivery[] = [];

  async record(delivery: {
    id: string;
    recipient: string;
    template: string;
    created_at: Date;
  }): Promise<MailDelivery> {
    const stored: MailDelivery = {
      id: delivery.id,
      recipient: delivery.recipient,
      template: delivery.template,
      createdAt: delivery.created_at.toISOString(),
    };
    this.deliveries.push(stored);
    return stored;
  }
}
