import asyncio, json, os, signal, sys
from aiohttp import web
from livekit import api, rtc

sessions = {}
pending = {}

async def resolve_audio(query):
    target = query if query.startswith(('http://', 'https://')) else f'ytsearch1:{query}'
    process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'yt_dlp', '--no-playlist', '-f', 'bestaudio/best', '-g', target, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await process.communicate()
    if process.returncode or not stdout.strip(): raise RuntimeError(stderr.decode(errors='ignore')[-300:] or 'Música não encontrada')
    return stdout.decode().splitlines()[0]

async def stream_track(room_name, query):
    source_url = await resolve_audio(query)
    room = rtc.Room()
    token = api.AccessToken(os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET']).with_identity(f'vix-bot:{room_name}').with_name('Vix Bot').with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=False)).to_jwt()
    await room.connect(os.environ['LIVEKIT_URL'], token)
    source = rtc.AudioSource(48000, 2, queue_size_ms=1000)
    track = rtc.LocalAudioTrack.create_audio_track('vix-music', source)
    await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
    process = await asyncio.create_subprocess_exec('ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', source_url, '-vn', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1', stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    sessions[room_name] = (room, source, process)
    try:
        while chunk := await process.stdout.readexactly(3840):
            await source.capture_frame(rtc.AudioFrame(data=chunk, sample_rate=48000, num_channels=2, samples_per_channel=960))
    except asyncio.IncompleteReadError as end:
        if end.partial:
            samples = len(end.partial) // 4
            if samples: await source.capture_frame(rtc.AudioFrame(data=end.partial[:samples*4], sample_rate=48000, num_channels=2, samples_per_channel=samples))
    finally:
        await source.wait_for_playout(); await source.aclose(); await room.disconnect(); sessions.pop(room_name, None)

def authorized(request):
    return request.headers.get('authorization') == f"Bearer {os.environ.get('MUSIC_BOT_TOKEN', '')}"

async def play(request):
    if not authorized(request): raise web.HTTPUnauthorized()
    body = await request.json(); room = str(body.get('room', '')); query = str(body.get('query', '')).strip()
    if not room or not query: raise web.HTTPBadRequest(text='room e query são obrigatórios')
    if room in sessions or room in pending: raise web.HTTPConflict(text='O bot já está tocando nesta sala')
    task = asyncio.create_task(stream_track(room, query)); pending[room] = task
    try:
        for _ in range(300):
            if room in sessions: break
            if task.done(): task.result()
            await asyncio.sleep(.1)
        else:
            task.cancel(); raise web.HTTPGatewayTimeout(text='A música demorou demais para iniciar')
    except web.HTTPException:
        raise
    except Exception as error:
        raise web.HTTPBadGateway(text=f'Não foi possível iniciar a música: {error}')
    finally:
        pending.pop(room, None)
    return web.json_response({'ok': True, 'room': room})

async def stop(request):
    if not authorized(request): raise web.HTTPUnauthorized()
    body = await request.json(); current = sessions.get(str(body.get('room', '')))
    if current: current[2].terminate()
    return web.json_response({'ok': True})

async def playback_control(request):
    if not authorized(request): raise web.HTTPUnauthorized()
    body = await request.json(); room_name = str(body.get('room', '')); current = sessions.get(room_name)
    if not current: raise web.HTTPNotFound(text='O bot não está tocando nesta sala')
    action = request.match_info['action']; process = current[2]
    if action == 'pause': process.send_signal(signal.SIGSTOP)
    elif action == 'resume': process.send_signal(signal.SIGCONT)
    else: raise web.HTTPNotFound()
    return web.json_response({'ok': True, 'action': action, 'room': room_name})

app = web.Application(); app.router.add_post('/play', play); app.router.add_post('/stop', stop); app.router.add_post('/{action:pause|resume}', playback_control)
web.run_app(app, host='127.0.0.1', port=int(os.environ.get('MUSIC_BOT_PORT', '8790')))
