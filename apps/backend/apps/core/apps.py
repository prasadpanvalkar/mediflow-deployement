from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        import apps.core.signals  # noqa: F401

        # ── Global IST timezone for all DRF DateTimeField outputs ─────────────
        # Override DRF's ModelSerializer field mapping so that every
        # DateTimeField in every serializer returns timestamps in
        # IST (Asia/Kolkata, UTC+05:30) automatically.
        # This is the single source of truth – no frontend patching needed.
        import django.db.models as models
        from rest_framework.serializers import ModelSerializer
        from apps.core.fields import ISTDateTimeField

        ModelSerializer.serializer_field_mapping[models.DateTimeField] = ISTDateTimeField
