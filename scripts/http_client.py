import json, logging, time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import httpx

class Client:
    def __init__(self):
        self.client = httpx.Client(timeout=30, follow_redirects=True, headers={'User-Agent':'ElectionAtlas/1.0 (public election research)'})
    def get(self,url,params=None):
        return self.request('GET',url,params=params)
    def post(self,url,data):
        return self.request('POST',url,json=data)
    def request(self,method,url,**kwargs):
        for attempt in range(4):
            try:
                response=self.client.request(method,url,**kwargs)
                if response.status_code == 429 or response.status_code >= 500:
                    response.raise_for_status()
                response.raise_for_status()
                return response.json()
            except (httpx.TransportError,httpx.HTTPStatusError) as exc:
                transient=not isinstance(exc,httpx.HTTPStatusError) or exc.response.status_code == 429 or exc.response.status_code>=500
                if not transient or attempt==3: raise
                retry=exc.response.headers.get('Retry-After') if isinstance(exc,httpx.HTTPStatusError) else None
                delay=2**attempt
                if retry:
                    try: delay=max(delay,float(retry))
                    except ValueError:
                        try: delay=max(delay,(parsedate_to_datetime(retry)-datetime.now(timezone.utc)).total_seconds())
                        except (TypeError,ValueError): pass
                if delay>120: raise RuntimeError('Provider requests backoff longer than run budget; retaining previous data') from exc
                logging.warning(json.dumps({'event':'retry','url':url,'attempt':attempt+1,'delay':delay}))
                time.sleep(delay)
