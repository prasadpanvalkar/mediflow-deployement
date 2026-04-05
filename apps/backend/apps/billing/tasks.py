from celery import shared_task


@shared_task(bind=True, max_retries=3)
def send_whatsapp_reminder(self, notification_log_id):
    """Send WhatsApp/SMS reminder for outstanding credit. Stub for now."""
    try:
        from apps.billing.models import NotificationLog
        from datetime import datetime
        log = NotificationLog.objects.get(id=notification_log_id)
        # TODO: Wire real WhatsApp API (Twilio/WATI) here in Phase 3
        log.status = 'sent'
        log.sent_at = datetime.now()
        log.save(update_fields=['status', 'sent_at'])
    except Exception as exc:
        from apps.billing.models import NotificationLog
        try:
            log = NotificationLog.objects.get(id=notification_log_id)
            log.status = 'failed'
            log.save(update_fields=['status'])
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=60)
