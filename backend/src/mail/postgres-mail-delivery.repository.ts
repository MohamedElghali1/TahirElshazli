import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { iso } from '../database/database.types.js';
import type {
  MailDelivery,
  MailDeliveryRepository,
} from './mail-delivery.repository.js';

interface MailDeliveryRow {
  id: string;
  recipient: string;
  template: string;
  created_at: Date;
}

function toDelivery(row: MailDeliveryRow): MailDelivery {
  return {
    id: row.id,
    recipient: row.recipient,
    template: row.template,
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class PostgresMailDeliveryRepository implements MailDeliveryRepository {
  constructor(private readonly db: DatabaseService) {}

  async record(delivery: {
    id: string;
    recipient: string;
    template: string;
    created_at: Date;
  }): Promise<MailDelivery> {
    const row = await this.db.queryOne<MailDeliveryRow>(
      `INSERT INTO mail_deliveries (id, recipient, template, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, recipient, template, created_at`,
      [delivery.id, delivery.recipient, delivery.template, delivery.created_at],
    );
    if (!row) {
      throw new Error('mail_deliveries INSERT returned no row');
    }
    return toDelivery(row);
  }
}
