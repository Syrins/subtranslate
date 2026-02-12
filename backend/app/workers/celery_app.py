from celery import Celery
from celery.schedules import crontab
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "subtranslate",
    broker=settings.redis_broker_url,
    backend=settings.redis_broker_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_cancel_long_running_tasks_on_connection_loss=True,
    task_soft_time_limit=3600,
    task_time_limit=7200,
    result_expires=86400,
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=None,
    broker_heartbeat=30,
    broker_pool_limit=10,
    broker_transport_options={
        "health_check_interval": 30,
        "retry_on_timeout": True,
        "socket_connect_timeout": 10,
        "socket_timeout": 120,
    },
    result_backend_transport_options={
        "health_check_interval": 30,
        "retry_on_timeout": True,
    },
    beat_schedule={
        "cleanup-expired-files": {
            "task": "app.workers.tasks.cleanup_expired_files_task",
            "schedule": crontab(minute="*/30"),  # Every 30 minutes
        },
        "reset-monthly-usage": {
            "task": "app.workers.tasks.reset_monthly_usage",
            "schedule": crontab(hour=0, minute=0, day_of_month=1),  # 1st of each month
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])
