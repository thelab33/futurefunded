import datetime
import json
import os

import pytz
from celery import Celery
from redis import Redis
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
TZ = pytz.timezone(os.getenv("TIMEZONE", "America/Chicago"))
celery = Celery(
    "fc",
    broker=REDIS_URL,
    backend=REDIS_URL,
    timezone=os.getenv("TIMEZONE", "America/Chicago"),
)
R = Redis.from_url(REDIS_URL)


def _week_key(dt=None):
    dt = dt or datetime.datetime.now(tz=TZ)
    iso = dt.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


@celery.task
def send_weekly_roi():
    wk = _week_key()
    h = {k.decode(): v.decode() for k, v in R.hgetall(f"fc:roi:{wk}").items()}
    recent = [json.loads(x) for x in R.lrange("fc:recent_donations", 0, 24)]
    lines = [
        f"FundChamps Weekly ROI ({wk})",
        f"Impressions: {h.get('impressions','0')}",
        f"Clicks:      {h.get('clicks','0')}",
        f"Donations:   {h.get('donations_count','0')} • $ {h.get('donations_total','0')}",
    ]
    lines.append("\nRecent donations:")
    for d in recent:
        lines.append(
            f" - {d.get('name','Supporter')}: $ {d.get('amount',0)} at {d.get('at','')}"
        )
    body = "\n".join(lines)
    to = os.getenv("ROI_REPORT_TO")
    api = os.getenv("SENDGRID_API_KEY")
    if api and to:
        msg = Mail(
            from_email="no-reply@fundchamps.app",
            to_emails=to,
            subject="FundChamps • Weekly Sponsor ROI",
            plain_text_content=body,
        )
        SendGridAPIClient(api).send(msg)
        return {"sent_to": to, "week": wk}
    else:
        print(body)
        return {"printed": True, "week": wk}


# schedule: Mondays 8:00am CT
from celery.schedules import crontab

celery.conf.beat_schedule = {
    "weekly-roi": {
        "task": "fc_tasks.send_weekly_roi",
        "schedule": crontab(minute=0, hour=8, day_of_week="mon"),
    }
}
