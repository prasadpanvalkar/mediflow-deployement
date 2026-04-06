from .base import *

DEBUG = False
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=[])
CORS_ALLOW_ALL_ORIGINS = False

STATIC_ROOT = '/app/staticfiles'
