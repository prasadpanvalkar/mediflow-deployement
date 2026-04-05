"""
Custom DRF fields.

ISTDateTimeField: overrides DRF DateTimeField so that all datetime values
are serialized in IST (Asia/Kolkata, UTC+05:30) instead of UTC.
This is the single-source-of-truth for all date/time output in the API.
"""
from zoneinfo import ZoneInfo

from django.utils import timezone as dj_tz
from rest_framework import serializers

IST = ZoneInfo("Asia/Kolkata")


class ISTDateTimeField(serializers.DateTimeField):
    """
    Subclass of DRF DateTimeField that converts aware datetimes to IST
    before formatting.  Naive datetimes are first made UTC-aware, then
    converted.  None / empty values are passed through unchanged.
    """

    def to_representation(self, value):
        if value is None:
            return None

        # Make timezone-aware if naive (treat as UTC)
        if dj_tz.is_naive(value):
            value = dj_tz.make_aware(value, dj_tz.utc)

        # Convert to IST
        value = value.astimezone(IST)

        return super().to_representation(value)
