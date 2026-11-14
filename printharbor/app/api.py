"""JSON API for DORINC.

The engine is PrintHarbor: the same printing, tailnet, image, and mail modules
the dashboard uses. DORINC keeps its own sign-in and permissions, so this API
trusts one shared bearer token and renders no HTML.
"""
import hashlib
import hmac
import os
import re
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from . import images, mailer, printing, store, supplies, tailnet

BOOT = {'ready': False, 'detail': 'Starting saved printers'}
_TASKS = {}
_TASK_LOCK = threading.Lock()
_ACTIVE = threading.local()
KEEPALIVE_SECONDS = 60
PAGES = ('overview', 'printers', 'jobs', 'email', 'tailscale')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PRIVATE = ('imap_password', 'email_pin')


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _phase(module, name, label):
    """Report which step a background setup is on, without changing the engine."""
    original = getattr(module, name)
    if getattr(original, '_phase_label', None):
        return

    def wrapper(*args, **kwargs):
        task = getattr(_ACTIVE, 'task', None)
        if task is not None:
            task['phase'] = label
        return original(*args, **kwargs)

    wrapper._phase_label = label
    wrapper.__wrapped__ = original
    setattr(module, name, wrapper)


_phase(tailnet, 'connect', 'Joining Tailscale')
_phase(printing, 'discover_printer', 'Reading the printer')
_phase(printing, 'load_drivers', 'Choosing a driver')
_phase(printing, 'configure_queue', 'Installing the driver')


def _boot():
    try:
        printing.retarget_saved_queues()
        BOOT['detail'] = ''
    except Exception:
        BOOT['detail'] = 'Saved printers could not be checked'
        store.event('warning', 'Saved printers could not be checked')
    BOOT['ready'] = True


def _keep_tailnet():
    """A printer device that stopped is started again and its queue re-pointed."""
    while not printing.STOP.wait(KEEPALIVE_SECONDS):
        if not BOOT['ready']:
            continue
        try:
            with store.connection() as db:
                rows = db.execute(
                    "SELECT queue, host, protocol FROM printers WHERE tail_hostname<>''"
                ).fetchall()
            for row in rows:
                queue = row['queue']
                if _busy(queue) or not Path(tailnet.state_for(queue)).exists():
                    continue
                if tailnet._socket_ready(Path(tailnet.socket_for(queue))):
                    continue
                tailnet._start_daemon(queue)
                tailnet.bind_host(queue, row['host'])
                try:
                    printing.use_tail_route(queue, row['host'], row['protocol'] or 'socket')
                except Exception:
                    pass
                store.event('info', f'Printer {queue} tailnet device restarted')
        except Exception:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.initialize()
    for flag in (mailer.STOP, printing.STOP, images.STOP, images.KICK):
        flag.clear()
    BOOT['ready'] = False
    threads = [
        threading.Thread(target=_boot, daemon=True, name='printer-boot'),
        threading.Thread(target=mailer.run_loop, daemon=True, name='imap-poller'),
        threading.Thread(target=printing.run_queue, daemon=True, name='print-queue'),
        threading.Thread(target=images.run_loop, daemon=True, name='printer-images'),
        threading.Thread(target=_keep_tailnet, daemon=True, name='tailnet-keepalive'),
    ]
    if os.getenv('PRINTHARBOR_SNAPSHOTS', '1') != '0':
        threads.append(threading.Thread(target=printing.run_snapshots, daemon=True, name='printer-snapshots'))
    for thread in threads:
        thread.start()
    yield
    try:
        tailnet.stop_all()
    except Exception:
        pass
    for flag in (mailer.STOP, printing.STOP, images.STOP, images.KICK):
        flag.set()
    for thread in threads[1:]:
        thread.join(timeout=2)


def _token():
    value = os.getenv('PRINTHARBOR_API_TOKEN', '').strip()
    if value:
        return value
    try:
        return (store.ROOT / 'api-token').read_text().strip()
    except OSError:
        return ''


def guard(authorization: str = Header('')):
    expected = _token()
    given = authorization[7:].strip() if authorization[:7].lower() == 'bearer ' else ''
    if not expected or not given or not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail='Invalid token')


app = FastAPI(title='PrintHarbor engine', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
secured = [Depends(guard)]


def _fail(message, status=400):
    return JSONResponse({'ok': False, 'message': ' '.join(str(message or 'That did not work').split())[:400]}, status_code=status)


@app.exception_handler(ApiError)
async def api_error(request, exc):
    return _fail(str(exc), exc.status)


@app.exception_handler(printing.PrintError)
async def print_error(request, exc):
    return _fail(str(exc))


@app.exception_handler(tailnet.TailscaleError)
async def tail_error(request, exc):
    return _fail(str(exc))


@app.exception_handler(images.ImageError)
async def image_error(request, exc):
    return _fail(str(exc))


def _queue(queue):
    if not printing.QUEUE_RE.fullmatch(queue or ''):
        raise ApiError('Unknown printer', 404)
    return queue


def _printer_row(queue):
    with store.connection() as db:
        row = db.execute('SELECT * FROM printers WHERE queue=?', (_queue(queue),)).fetchone()
    if not row:
        raise ApiError('Printer not found', 404)
    return dict(row)


def queue_for(label):
    """A CUPS queue name from the name someone typed: 'Office Printer' is Office_Printer."""
    base = re.sub(r'[^A-Za-z0-9]+', '_', str(label or '')).strip('_')
    if not base or not base[0].isalpha():
        base = ('Printer_' + base).strip('_')
    return base[:36].strip('_') or 'Printer'


def free_queue(label):
    base = queue_for(label)
    with store.connection() as db:
        taken = {row['queue'].lower() for row in db.execute('SELECT queue FROM printers')}
    with _TASK_LOCK:
        taken.update(name.lower() for name, task in _TASKS.items() if task['running'])
    if base.lower() not in taken:
        return base
    for number in range(2, 100):
        name = f'{base}_{number}'
        if name.lower() not in taken:
            return name
    raise ApiError('Choose a different printer name')


def _busy(queue):
    with _TASK_LOCK:
        task = _TASKS.get(queue)
        return bool(task and task['running'])


def _start(queue, kind, label, host, phase, work):
    """Run slow printer work off the request. A reverse proxy does not wait minutes."""
    task = {
        'queue': queue, 'kind': kind, 'label': label, 'host': host, 'phase': phase,
        'error': '', 'notice': '', 'running': True, 'started': time.time(), 'finished': 0,
    }
    with _TASK_LOCK:
        current = _TASKS.get(queue)
        if current and current['running']:
            raise ApiError('This printer is still being set up', 409)
        _TASKS[queue] = task

    def run():
        _ACTIVE.task = task
        try:
            note = work()
            task['notice'] = str(note or '')[:200]
        except Exception as exc:
            text = _plain_reason(exc)
            task['error'] = text
            store.event('error', f'Printer {queue}: {text}'[:600])
        finally:
            _ACTIVE.task = None
            task['phase'] = ''
            task['running'] = False
            task['finished'] = time.time()
            printing.clear_snapshots()
            tailnet._forget_status()

    threading.Thread(target=run, daemon=True, name=f'setup-{queue}').start()
    return task


def _plain_reason(exc):
    text = ' '.join(str(exc).split())[:400] or 'Setup did not finish'
    low = text.lower()
    if 'invalid key' in low or 'api key does not exist' in low or 'key expired' in low or 'already used' in low:
        return 'Tailscale did not accept that auth key. Create a new key in the Tailscale admin console and try again.'
    if 'timed out' in low and 'tailscale' in low:
        return 'Tailscale did not connect in time. Check that this server can reach the internet, then try again.'
    return text


def _task_view(task):
    if not task:
        return None
    if not task['running'] and not task['error']:
        # A finished setup stays for a moment so the page can say it worked.
        if time.time() - task['finished'] > 20:
            return None
    return {
        'kind': task['kind'], 'label': task['label'], 'host': task['host'], 'queue': task['queue'],
        'phase': task['phase'], 'error': task['error'], 'notice': task['notice'],
        'running': task['running'],
        'seconds': int((task['finished'] or time.time()) - task['started']),
    }


def _settings_view(cfg):
    shown = {key: value for key, value in cfg.items() if key not in PRIVATE}
    shown['imap_password_saved'] = bool(cfg.get('imap_password'))
    shown['email_pin'] = cfg.get('email_pin') or ''
    return shown


def _job_view(job):
    path = job.get('filepath') or ''
    return {
        'id': job['id'], 'created_at': job['created_at'], 'source': job['source'],
        'sender': job.get('sender') or '', 'filename': job['filename'], 'queue': job['queue'],
        'pages': job.get('pages'), 'copies': job.get('copies') or 1,
        'sides': job.get('sides') or 'one-sided', 'status': job['status'],
        'cups_id': job.get('cups_id') or '', 'error': job.get('error') or '',
        'has_file': bool(path and _inside_files(path)),
    }


def _inside_files(path):
    try:
        target = Path(path).resolve()
        return target.is_file() and (store.ROOT / 'files').resolve() in target.parents
    except OSError:
        return False


def _image_view(printer):
    view = images.describe(printer)
    try:
        path, _ = images.file_for(printer['queue'])
        stamp = f'{path}:{Path(path).stat().st_mtime_ns}'
    except OSError:
        stamp = str(time.time())
    view['version'] = hashlib.sha1(stamp.encode()).hexdigest()[:12]
    view['mode'] = printer.get('image_mode') or 'auto'
    return view


def _printer_view(printer, tail, detail):
    queue = printer['queue']
    identity = printer.get('identity') or printer.get('label') or ''
    online, stats = printing.page_snapshot(printer['host'], printer['protocol'], identity)
    with _TASK_LOCK:
        task = _TASKS.get(queue)
    view = {
        'queue': queue,
        'label': printer['label'],
        'host': printer['host'],
        'protocol': printer['protocol'],
        'identity': printer.get('identity') or '',
        'driver': printer.get('driver') or '',
        'online': bool(online),
        'stats': stats,
        'condition': printing.condition(stats, online),
        'supply': supplies.from_printer(printer),
        'image': _image_view(printer),
        'tail': tail.get(queue) or {
            'online': False,
            'hostname': printer.get('tail_hostname') or '',
            'ip': printer.get('tail_ip') or '',
            'state': 'Not joined',
        },
        'setup': _task_view(task),
        'ready': bool(printer.get('driver')),
    }
    if detail:
        view['options'] = printing.queue_options(queue)
        view['driver_info'] = printing.describe_driver(
            printer.get('driver') or '', printer.get('protocol') or '', printing.installed_driver(queue),
        )
    return view


@app.get('/api/health')
def health():
    return {'service': 'printharbor', 'ready': BOOT['ready']}


@app.get('/api/state', dependencies=secured)
def state(page: str = 'overview'):
    if page not in PAGES:
        page = 'overview'
    cfg = store.settings()
    printers = store.records('printers')
    tail = tailnet.status()
    by_queue = {item['queue']: item for item in (tail.get('devices') or [])}
    saved = {item['queue'] for item in printers}
    shown = [_printer_view(item, by_queue, page == 'printers') for item in printers]
    with _TASK_LOCK:
        loose = [task for name, task in _TASKS.items() if name not in saved and task['kind'] == 'add']
    setups = [view for view in (_task_view(task) for task in loose) if view and (view['running'] or view['error'])]
    jobs = [_job_view(job) for job in store.records('jobs', 100)] if page in ('overview', 'jobs') else []
    return {
        'page': page,
        'ready': BOOT['ready'],
        'boot': BOOT['detail'],
        'printers': shown,
        'setups': setups,
        'jobs': jobs,
        'counts': {
            'total': len(jobs),
            'errors': sum(job['status'] in ('error', 'rejected') for job in jobs),
            'submitted': sum(job['status'] == 'submitted' for job in jobs),
            'pending': sum(job['status'] == 'pending' for job in jobs),
            'printers': len(printers),
        },
        'mail': mailer.snapshot(),
        'events': store.records('events', 40) if page in ('overview', 'printers') else [],
        'tail': {key: value for key, value in tail.items() if key != 'devices'},
        'active_jobs': printing.active_jobs() if page in ('overview', 'jobs') else {'ok': True, 'lines': [], 'error': ''},
        'cups': printing.cups_printers() if page == 'printers' else {'ok': True, 'lines': [], 'error': ''},
        'settings': _settings_view(cfg),
        'allowed': sorted(printing.ALLOWED),
    }


@app.get('/api/targets', dependencies=secured)
def targets():
    rows = store.records('printers')
    return {'printers': [
        {'queue': row['queue'], 'label': row['label'], 'ready': bool(row.get('driver'))} for row in rows
    ]}


def _text(body, key, limit=200):
    return ' '.join(str(body.get(key) or '').split())[:limit]


@app.post('/api/printers', dependencies=secured)
def add_printer(body: dict):
    label = _text(body, 'label', 100)
    if not label:
        raise ApiError('Enter a printer name')
    address = printing._ipv4(body.get('host'))
    key = ''.join(str(body.get('auth_key') or '').split())
    if key:
        key = tailnet._auth_key(key)
        if not tailnet._installed():
            raise ApiError('Tailscale is not installed in the print service. Redeploy the current image.')
    name = _text(body, 'tail_hostname', 63)
    if name and not tailnet.HOSTNAME_RE.fullmatch(name):
        raise ApiError('Hostname must use letters, numbers, and hyphens.')
    queue = _text(body, 'queue', 41) or free_queue(label)
    if not printing.QUEUE_RE.fullmatch(queue):
        raise ApiError('Queue must begin with a letter and contain only letters, numbers, _ or -')
    with store.connection() as db:
        if db.execute('SELECT 1 FROM printers WHERE queue=?', (queue,)).fetchone():
            raise ApiError('A printer with that name is already set up')

    def work():
        identity = printing.add_printer(label, queue, address, 'socket', key, name)
        if not store.settings().get('default_queue'):
            store.set_setting('default_queue', queue)
        return identity

    _start(queue, 'add', label, address, 'Joining Tailscale' if key else 'Reading the printer', work)
    return {'ok': True, 'queue': queue, 'label': label}


@app.delete('/api/setups/{queue}', dependencies=secured)
def dismiss_setup(queue: str):
    with _TASK_LOCK:
        task = _TASKS.get(_queue(queue))
        if task and task['running']:
            raise ApiError('This printer is still being set up', 409)
        _TASKS.pop(queue, None)
    return {'ok': True}


@app.patch('/api/printers/{queue}', dependencies=secured)
def edit_printer(queue: str, body: dict):
    row = _printer_row(queue)
    label = _text(body, 'label', 100) or row['label']
    address = printing._ipv4(body.get('host') or row['host'])
    reread = bool(body.get('reread'))
    if address == row['host'] and not reread:
        identity = printing.update_printer(queue, label, address)
        return {'ok': True, 'pending': False, 'identity': identity}
    _start(queue, 'update', label, address, 'Reading the printer',
           lambda: printing.update_printer(queue, label, address, reread=reread))
    return {'ok': True, 'pending': True}


@app.post('/api/printers/{queue}/setup', dependencies=secured)
def setup_again(queue: str):
    """Read a saved printer again, for one that joined the tailnet before it answered."""
    row = _printer_row(queue)

    def work():
        if tailnet.has_node(queue):
            tailnet._start_daemon(queue)
            tailnet.bind_host(queue, row['host'])
        return printing.update_printer(queue, row['label'], row['host'], reread=True)

    _start(queue, 'update', row['label'], row['host'], 'Reading the printer', work)
    return {'ok': True, 'pending': True}


@app.delete('/api/printers/{queue}', dependencies=secured)
def remove_printer(queue: str):
    _printer_row(queue)
    if _busy(queue):
        raise ApiError('This printer is still being set up', 409)
    try:
        printing.remove_printer(queue)
    except printing.PrintError:
        # A printer saved before it answered has no CUPS queue to delete.
        known = printing.cmd('lpstat', '-p', queue, timeout=10)
        if known.returncode == 0:
            raise
        try:
            tailnet.disconnect(queue)
        except Exception:
            store.event('warning', f'Printer {queue} was removed, but its tailnet device may still be signed in')
        with store.connection() as db:
            db.execute('DELETE FROM printers WHERE queue=?', (queue,))
    if store.settings().get('default_queue') == queue:
        store.set_setting('default_queue', '')
    with _TASK_LOCK:
        _TASKS.pop(queue, None)
    printing.clear_snapshots()
    store.event('info', f'Printer {queue} removed')
    return {'ok': True}


@app.post('/api/printers/{queue}/options', dependencies=secured)
def printer_options(queue: str, body: dict):
    _printer_row(queue)
    choices = body.get('options') or {}
    if not isinstance(choices, dict):
        raise ApiError('Invalid driver settings')
    saved = printing.apply_queue_options(queue, {str(k): str(v) for k, v in choices.items()})
    return {'ok': True, 'saved': saved}


@app.post('/api/printers/{queue}/tailscale', dependencies=secured)
def printer_tailscale(queue: str, body: dict):
    row = _printer_row(queue)
    action = str(body.get('action') or '')
    if action == 'leave':
        if _busy(queue):
            raise ApiError('This printer is still being set up', 409)
        printing.leave_tailnet(queue)
        store.event('info', f'{queue} left the tailnet')
        return {'ok': True, 'pending': False}
    if action != 'join':
        raise ApiError('Choose whether this printer joins or leaves the tailnet')
    key = tailnet._auth_key(str(body.get('auth_key') or ''))
    name = _text(body, 'hostname', 63)
    if name and not tailnet.HOSTNAME_RE.fullmatch(name):
        raise ApiError('Hostname must use letters, numbers, and hyphens.')

    def work():
        info = printing.join_tailnet(queue, key, name)
        joined = (info or {}).get('hostname') or queue
        store.event('info', f'{queue} joined the tailnet as {joined}')
        if not row.get('driver'):
            try:
                printing.update_printer(queue, row['label'], row['host'], reread=True)
            except printing.PrintError:
                return f'{joined} joined the tailnet. The printer has not answered yet.'
        return f'{joined} joined the tailnet'

    _start(queue, 'join', row['label'], row['host'], 'Joining Tailscale', work)
    return {'ok': True, 'pending': True}


def _image_file(path, media, cache, pending=False):
    return FileResponse(path, media_type=media, headers={
        'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff',
        'X-Image-Pending': '1' if pending else '0',
    })


@app.get('/api/printers/{queue}/image', dependencies=secured)
def printer_image(queue: str):
    path, media = images.file_for(_queue(queue))
    printer = images._printer(queue)
    pending = bool(printer and images.describe(printer).get('pending'))
    return _image_file(path, media, 'private, no-cache' if pending else 'private, max-age=300', pending)


@app.get('/api/printers/{queue}/image/preview', dependencies=secured)
def printer_preview(queue: str):
    path = images.preview_file(_queue(queue))
    if not path:
        raise ApiError('No preview', 404)
    return _image_file(path, images.media_type(path), 'private, no-cache')


@app.get('/api/images/candidate/{kind}/{item}', dependencies=secured)
def image_candidate(kind: str, item: str):
    path = images.ensure_candidate(kind, item)
    if not path:
        svg, media = images.static_svg('generic')
        return _image_file(svg, media, 'private, max-age=60')
    return _image_file(path, images.media_type(path), 'private, max-age=86400')


@app.post('/api/printers/{queue}/image', dependencies=secured)
def printer_image_choice(
    queue: str, action: str = Form(...), choice: str = Form(''), illustration: str = Form(''),
    upload: UploadFile | None = File(None),
):
    _printer_row(queue)
    if action == 'search':
        images.search_again(queue)
        return {'ok': True, 'notice': 'Looking for a picture of this printer'}
    if action == 'auto':
        images.restore_auto(queue)
        return {'ok': True, 'notice': 'Automatic printer picture restored'}
    if action == 'apply-preview':
        images.apply_preview(queue)
        return {'ok': True, 'notice': 'Printer picture saved'}
    if action in ('apply', 'preview'):
        if action == 'apply' and choice:
            images.apply_choice(queue, choice)
        elif action == 'apply' and illustration:
            images.apply_illustration(queue, illustration)
        elif upload is not None and upload.filename:
            images.save_upload(queue, upload.filename, upload.file.read(2_100_000))
            if action == 'preview':
                return {'ok': True, 'preview': True}
            images.apply_preview(queue)
        else:
            raise ApiError('Choose a picture first')
        return {'ok': True, 'notice': 'Printer picture saved'}
    raise ApiError('That picture action is not available')


@app.put('/api/settings/images', dependencies=secured)
def image_settings(body: dict):
    action = str(body.get('action') or 'save')
    if action == 'refresh':
        if not images.refresh_fingerprint(force=True):
            raise ApiError('The printer catalog could not be refreshed. The previous copy was kept.')
        return {'ok': True, 'notice': 'Printer catalog refreshed'}
    if action == 'clear':
        images.clear_cache()
        return {'ok': True, 'notice': 'Printer picture cache cleared'}
    if action == 'rescan':
        images.rescan_all()
        return {'ok': True, 'notice': 'Printer pictures will be looked up again'}
    cfg = store.settings()

    def flag(name):
        if name not in body:
            return cfg.get(name, '1') != '0'
        return body.get(name) in (True, 1, '1', 'true')

    images.update_settings(
        flag('images_auto'), flag('images_unifi'), flag('images_wikimedia'), flag('images_cache'),
        str(body.get('images_catalog_days') or cfg.get('images_catalog_days') or '14'),
    )
    return {'ok': True, 'notice': 'Printer picture settings saved'}


@app.post('/api/jobs', dependencies=secured)
def submit_job(
    printer: str = Form(...), sides: str = Form('one-sided'), copies: int = Form(1),
    source: str = Form('upload'), sender: str = Form(''), file: UploadFile = File(...),
):
    name = file.filename or 'document.pdf'
    origin = re.sub(r'[^a-z0-9-]+', '', source.lower())[:20] or 'upload'
    who = ' '.join(sender.split())[:200]
    max_mb = max(1, min(int(store.settings().get('max_mb', '12')), 30))
    contents = file.file.read(max_mb * 1024 * 1024 + 1)
    if len(contents) > max_mb * 1024 * 1024:
        printing.record_rejection(name, f'File larger than {max_mb} MB limit', printer, origin, who)
        raise ApiError(f'File larger than {max_mb} MB limit')
    job_id = printing.submit_file(name, contents, printer, copies, sides, source=origin, sender=who)
    return {'ok': True, 'id': job_id}


def _job(job_id):
    with store.connection() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if not row:
        raise ApiError('Job not found', 404)
    return dict(row)


@app.post('/api/jobs/{job_id}/retry', dependencies=secured)
def retry_job(job_id: int):
    if _job(job_id)['status'] != 'error':
        raise ApiError('Only failed jobs can be retried')
    printing.requeue(job_id)
    return {'ok': True}


@app.post('/api/jobs/{job_id}/cancel', dependencies=secured)
def cancel_job(job_id: int):
    printing.cancel_pending(job_id)
    return {'ok': True}


@app.get('/api/jobs/{job_id}/file', dependencies=secured)
def job_file(job_id: int):
    job = _job(job_id)
    path = job.get('filepath') or ''
    if not path or not _inside_files(path):
        raise ApiError('The saved document is no longer available', 404)
    return FileResponse(path, media_type='application/pdf', headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    })


@app.delete('/api/jobs/{job_id}', dependencies=secured)
def delete_job(job_id: int):
    job = _job(job_id)
    if job['status'] in ('sending', 'preparing'):
        raise ApiError('This document is on its way to the printer')
    path = job.get('filepath') or ''
    with store.connection() as db:
        db.execute('DELETE FROM jobs WHERE id=?', (job_id,))
        shared = db.execute('SELECT 1 FROM jobs WHERE filepath=? LIMIT 1', (path,)).fetchone() if path else None
    if path and not shared and _inside_files(path):
        Path(path).unlink(missing_ok=True)
    return {'ok': True}


def _number(body, key, default):
    try:
        return int(body.get(key, default))
    except (TypeError, ValueError):
        raise ApiError('Invalid configuration limits') from None


def _switch(body, key, saved):
    if key not in body:
        return saved.get(key, '0')
    return '1' if body.get(key) in (True, 1, '1', 'true') else '0'


def _mail_values(body, saved):
    def text(key, default=''):
        return str(body[key]).strip() if key in body and body[key] is not None else saved.get(key, default)

    imap_port = _number(body, 'imap_port', saved.get('imap_port', 993))
    smtp_port = _number(body, 'smtp_port', saved.get('smtp_port', 587))
    poll = _number(body, 'poll_seconds', saved.get('poll_seconds', 3))
    pages = _number(body, 'max_pages', saved.get('max_pages', 40))
    megabytes = _number(body, 'max_mb', saved.get('max_mb', 12))
    files = _number(body, 'max_files', saved.get('max_files', 5))
    if not (1 <= imap_port <= 65535 and 1 <= smtp_port <= 65535 and 2 <= poll <= 3600
            and 1 <= pages <= 200 and 1 <= megabytes <= 30 and 1 <= files <= 10):
        raise ApiError('Invalid configuration limits')
    sides = text('default_sides', 'one-sided')
    if sides not in printing.SIDES:
        raise ApiError('Invalid duplex option')
    host = text('imap_host', 'imap.gmail.com')
    if not host:
        raise ApiError('IMAP server is required')
    folder = text('imap_folder', 'INBOX')
    if not folder or len(folder) > 200 or any(ch in folder for ch in '\r\n\x00'):
        raise ApiError('Choose a mailbox folder')
    sender = text('smtp_from')
    if sender and not EMAIL_RE.fullmatch(sender):
        raise ApiError('From address must be an email address')
    return {
        'mail_enabled': _switch(body, 'mail_enabled', saved),
        'imap_host': host,
        'imap_port': str(imap_port),
        'imap_user': text('imap_user'),
        'imap_folder': folder,
        'allowed_senders': text('allowed_senders'),
        'mail_recipient': text('mail_recipient'),
        'default_queue': text('default_queue'),
        'default_sides': sides,
        'print_email_body': _switch(body, 'print_email_body', saved),
        'poll_seconds': str(poll),
        'max_pages': str(pages),
        'max_mb': str(megabytes),
        'max_files': str(files),
        'reply_enabled': _switch(body, 'reply_enabled', saved),
        'smtp_from': sender,
        'smtp_host': text('smtp_host', 'smtp.gmail.com') or 'smtp.gmail.com',
        'smtp_port': str(smtp_port),
    }


@app.put('/api/settings/mail', dependencies=secured)
def save_mail(body: dict):
    saved = store.settings()
    values = _mail_values(body, saved)
    password = ''.join(str(body.get('imap_password') or '').split())
    if values['default_queue']:
        with store.connection() as db:
            if not db.execute('SELECT 1 FROM printers WHERE queue=?', (values['default_queue'],)).fetchone():
                raise ApiError('Choose a configured printer')
    pin = None
    if 'email_pin' in body:
        pin = str(body.get('email_pin') or '').strip()
        if pin and not re.fullmatch(r'[A-Za-z0-9]{6,32}', pin):
            raise ApiError('PIN must be 6 to 32 letters or digits, or blank to require none')
    with store.connection() as db:
        for key, value in values.items():
            store.set_setting(key, value, db=db)
        if password:
            store.set_setting('imap_password', password, db=db)
        if pin is not None:
            store.set_setting('email_pin', pin, db=db)
    store.event('info', 'Email printing settings updated')
    return {'ok': True, 'settings': _settings_view(store.settings())}


@app.post('/api/mail/folders', dependencies=secured)
def mail_folders(body: dict):
    saved = store.settings()
    values = _mail_values(body, saved)
    secret = ''.join(str(body.get('imap_password') or '').split()) or saved.get('imap_password') or ''
    if not secret or not values['imap_user']:
        raise ApiError('Enter the mailbox address and app password before loading folders')
    try:
        names = mailer.list_folders(values['imap_host'], int(values['imap_port']), values['imap_user'], secret)
    except Exception as exc:
        raise ApiError(str(exc).replace(secret, '')[:180] or 'Could not list mailbox folders') from None
    return {'ok': True, 'folders': names}
