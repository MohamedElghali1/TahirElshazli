/**
 * Append-only delivery log.
 *
 * Stores recipient and template only - never `data` or the rendered body.
 * No `find` or `list` - nothing in scope reads these back.
 */
export interface MailDelivery {
  id: string;
  recipient: string;
  template: string;
  createdAt: string;
}

export interface MailDeliveryRepository {
  record(delivery: {
    id: string;
    recipient: string;
    template: string;
    created_at: Date;
  }): Promise<MailDelivery>;
}

export const MAIL_DELIVERY_REPOSITORY = Symbol('MAIL_DELIVERY_REPOSITORY');
