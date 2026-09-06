const E=new TextEncoder(),j=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}}),one=x=>[...x][0];
const b64=x=>btoa(String.fromCharCode(...x)),unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function hash(p,s){const k=await crypto.subtle.importKey('raw',E.encode(p),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256))}
async function identity(env,token){const r=await env.USERS.get(env.USERS.idFromName('global')).fetch(`https://auth/session?token=${encodeURIComponent(token||'')}`);return r.ok?(await r.json()).user:null}

export default {async fetch(req,env){const u=new URL(req.url),token=req.headers.get('Authorization')?.replace('Bearer ','')||u.searchParams.get('token')||'';if(u.pathname.startsWith('/api/auth/'))return env.USERS.get(env.USERS.idFromName('global')).fetch(req);if(u.pathname==='/api/turn'){const user=await identity(env,token);if(!user)return j({error:'Não autenticado'},401);if(!env.METERED_TURN_API_KEY)return j({error:'TURN ainda não configurado.'},503);const upstream=await fetch(`https://vixvoice.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_TURN_API_KEY)}`,{signal:AbortSignal.timeout(8000)});if(!upstream.ok)return j({error:`A Metered recusou a chave TURN (${upstream.status}).`},502);const data=await upstream.json();if(!Array.isArray(data)||!data.some(server=>String(server.urls||'').startsWith('turn')))return j({error:'A Metered não retornou servidores TURN.'},502);return j(data)}if(u.pathname.startsWith('/api/servers')){u.searchParams.set('token',token);return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers${u.pathname}${u.search}`,req))}const m=u.pathname.match(/^\/signal\/([\w-]+)$/);if(m)return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers/ws/${m[1]}?token=${encodeURIComponent(token)}`,req));const asset=await env.ASSETS.fetch(req);if(req.method==='GET'&&(u.pathname==='/'||/\.(?:html|js|css)$/.test(u.pathname))){const headers=new Headers(asset.headers);headers.set('cache-control','no-store, max-age=0');return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers})}return asset}};

export class Users{constructor(c){this.c=c;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,avatar_color TEXT,password_hash TEXT,created_at INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER)')}async fetch(r){const u=new URL(r.url);if(r.method==='POST'&&u.pathname==='/api/auth/register'){const x=await r.json(),email=String(x.email||'').trim().toLowerCase(),name=String(x.name||'').trim().slice(0,24),pass=String(x.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||pass.length<8)return j({error:'Informe nome, e-mail válido e senha com 8 caracteres.'},400);if(one(this.c.storage.sql.exec('SELECT id FROM users WHERE email=?',email)))return j({error:'Este e-mail já possui uma conta.'},409);const salt=crypto.getRandomValues(new Uint8Array(16)),id=crypto.randomUUID(),color=['#5865f2','#eb459e','#23a559','#f0b232'][Math.floor(Math.random()*4)];this.c.storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?)',id,email,name,color,`${b64(salt)}.${b64(await hash(pass,salt))}`,Date.now());return this.session({id,email,name,color})}if(r.method==='POST'&&u.pathname==='/api/auth/login'){const x=await r.json(),z=one(this.c.storage.sql.exec('SELECT * FROM users WHERE email=?',String(x.email||'').trim().toLowerCase()));if(!z)return j({error:'E-mail ou senha incorretos.'},401);const[a,h]=z.password_hash.split('.').map(unb64),d=await hash(String(x.password||''),a);if(d.some((v,i)=>v!==h[i]))return j({error:'E-mail ou senha incorretos.'},401);return this.session(z)}if(u.pathname==='/session'){const z=one(this.c.storage.sql.exec('SELECT users.id,users.email,users.display_name AS name,users.avatar_color AS color FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',u.searchParams.get('token'),Date.now()));return z?j({user:z}):j({error:'Sessão expirada'},401)}return j({error:'Rota inexistente'},404)}session(u){const t=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');this.c.storage.sql.exec('INSERT INTO sessions VALUES(?,?,?)',t,u.id,Date.now()+2592000000);return j({token:t,user:{id:u.id,email:u.email,name:u.name||u.display_name,color:u.color||u.avatar_color}})}}

export class Servers{constructor(c,env){this.c=c;this.env=env;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY,name TEXT,icon TEXT,owner TEXT,invite TEXT UNIQUE,created INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS members(server_id TEXT,user_id TEXT,role TEXT,PRIMARY KEY(server_id,user_id))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS channels(server_id TEXT,name TEXT,PRIMARY KEY(server_id,name))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,server_id TEXT,channel TEXT,author TEXT,author_id TEXT,text TEXT,created INTEGER,edited INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS reactions(message_id TEXT,emoji TEXT,user_id TEXT,PRIMARY KEY(message_id,emoji,user_id))');}
  user(req){return identity(this.env,req.headers.get('x-vix-token')||new URL(req.url).searchParams.get('token'))} member(s,u){return one(this.c.storage.sql.exec('SELECT role FROM members WHERE server_id=? AND user_id=?',s,u.id))?.role} admin(s,u){return ['Dono','Admin'].includes(this.member(s,u))}
  async fetch(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);if(u.pathname==='/api/servers'&&req.method==='GET')return j({servers:[...this.c.storage.sql.exec('SELECT servers.* ,members.role FROM servers JOIN members ON servers.id=members.server_id WHERE members.user_id=? ORDER BY created',user.id)]});if(u.pathname==='/api/servers'&&req.method==='POST'){const x=await req.json(),name=String(x.name||'').trim().slice(0,32);if(name.length<2)return j({error:'Nome inválido'},400);const id=crypto.randomUUID(),invite=crypto.randomUUID().slice(0,8);this.c.storage.sql.exec('INSERT INTO servers VALUES(?,?,?,?,?,?)',id,name,name.slice(0,1).toUpperCase(),user.id,invite,Date.now());this.c.storage.sql.exec('INSERT INTO members VALUES(?,?,?)',id,user.id,'Dono');for(const n of ['geral','boas-vindas'])this.c.storage.sql.exec('INSERT INTO channels VALUES(?,?)',id,n);return j({id,name,invite})}const join=u.pathname.match(/^\/api\/servers\/join\/([\w-]+)$/);if(join&&req.method==='POST'){const s=one(this.c.storage.sql.exec('SELECT id FROM servers WHERE invite=?',join[1]));if(!s)return j({error:'Convite inválido'},404);this.c.storage.sql.exec('INSERT OR IGNORE INTO members VALUES(?,?,?)',s.id,user.id,'Membro');return j({id:s.id})}const info=u.pathname.match(/^\/api\/servers\/([\w-]+)$/);if(info&&req.method==='GET'){if(!this.member(info[1],user))return j({error:'Sem acesso'},403);return j({channels:[...this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=?',info[1])],messages:[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? ORDER BY created DESC LIMIT 200',info[1])].reverse()})}const ws=u.pathname.match(/^\/ws\/([\w-]+)$/);if(ws)return this.websocket(req,ws[1],user);return j({error:'Rota inexistente'},404)}
  websocket(req,serverId,user){if(!this.member(serverId,user))return new Response('Sem acesso',{status:403});const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();server.addEventListener('message',e=>this.message(serverId,user,server,e.data));return new Response(null,{status:101,webSocket:client})}message(s,u,peer,raw){let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='chat'){const text=String(m.text||'').trim().slice(0,1000),channel=String(m.channel||'').slice(0,32);if(!text)return;const id=crypto.randomUUID(),created=Date.now();this.c.storage.sql.exec('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',id,s,channel,u.name,u.id,text,created,0);peer.send(JSON.stringify({type:'chat',id,channel,name:u.name,text,created}));return}}}

const serversFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);const channel=u.pathname.match(/^\/api\/servers\/([\w-]+)\/channels$/),message=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages$/);if(channel&&req.method==='POST'){if(!this.admin(channel[1],user))return j({error:'Sem permissão.'},403);const x=await req.json(),name=String(x.name||'').toLowerCase().replace(/\s+/g,'-').slice(0,32);if(!/^[a-z0-9_-]{1,32}$/.test(name))return j({error:'Canal inválido.'},400);this.c.storage.sql.exec('INSERT OR IGNORE INTO channels VALUES(?,?)',channel[1],name);return j({name})}if(message&&req.method==='POST'){if(!this.member(message[1],user))return j({error:'Sem acesso'},403);const x=await req.json(),text=String(x.text||'').trim().slice(0,1000),name=String(x.channel||'').slice(0,32);if(!text||!name)return j({error:'Mensagem inválida.'},400);const item={id:crypto.randomUUID(),server_id:message[1],channel:name,author:user.name,author_id:user.id,text,created:Date.now(),edited:0};this.c.storage.sql.exec('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',item.id,item.server_id,item.channel,item.author,item.author_id,item.text,item.created,item.edited);return j({message:item})}return serversFetch.call(this,req)};

const messagesFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);const match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)$/),reaction=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)\/reactions$/);if(match){const message=one(this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND id=?',match[1],match[2]));if(!message)return j({error:'Mensagem não encontrada.'},404);if(req.method==='PATCH'){if(message.author_id!==user.id&&!this.admin(match[1],user))return j({error:'Sem permissão.'},403);const x=await req.json(),text=String(x.text||'').trim().slice(0,1000);if(!text)return j({error:'Mensagem inválida.'},400);this.c.storage.sql.exec('UPDATE messages SET text=?,edited=? WHERE id=?',text,Date.now(),message.id);return j({message:{...message,text,edited:Date.now()}})}if(req.method==='DELETE'){if(message.author_id!==user.id&&!this.admin(match[1],user))return j({error:'Sem permissão.'},403);this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=?',message.id);this.c.storage.sql.exec('DELETE FROM messages WHERE id=?',message.id);return j({ok:true})}}if(reaction&&req.method==='POST'){const x=await req.json(),emoji=String(x.emoji||'').slice(0,8);if(!emoji)return j({error:'Reação inválida.'},400);const exists=one(this.c.storage.sql.exec('SELECT user_id FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',reaction[2],emoji,user.id));if(exists)this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',reaction[2],emoji,user.id);else this.c.storage.sql.exec('INSERT INTO reactions VALUES(?,?,?)',reaction[2],emoji,user.id);const count=[...this.c.storage.sql.exec('SELECT user_id FROM reactions WHERE message_id=? AND emoji=?',reaction[2],emoji)].length;return j({emoji,count,active:!exists})}return messagesFetch.call(this,req)};

// A interface recebe somente os nomes dos canais, não as linhas do banco.
const normalizedServerFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),response=await normalizedServerFetch.call(this,req);if(req.method==='GET'&&/^\/api\/servers\/[\w-]+$/.test(u.pathname)&&response.ok){const data=await response.json();data.channels=(data.channels||[]).map(channel=>typeof channel==='string'?channel:channel.name);return j(data)}return response};

// Presença de voz e administração de canais por dono/admin.
const communityFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');const voice=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice$/),channel=u.pathname.match(/^\/api\/servers\/([\w-]+)\/channels\/([\w-]+)$/);if(voice){const serverId=voice[1];if(!this.member(serverId,user))return j({error:'Sem acesso'},403);if(req.method==='GET'){const users=new Map();for(const peer of this.voiceSockets?.get(serverId)||[]){if(peer.joined&&peer.socket.readyState===1)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});}return j({users:[...users.values()].sort((a,b)=>a.name.localeCompare(b.name))})}if(req.method==='POST'){const body=await req.json(),name=String(body.channel||'Geral').slice(0,64);this.c.storage.sql.exec('INSERT OR REPLACE INTO voice_presence VALUES(?,?,?,?,?,?)',serverId,name,user.id,user.name,user.color||'#5865f2',Date.now());return j({ok:true})}if(req.method==='DELETE'){this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,user.id);return j({ok:true})}}if(channel){const serverId=channel[1],oldName=channel[2];if(!this.admin(serverId,user))return j({error:'Apenas dono ou administradores podem gerenciar canais.'},403);if(req.method==='PATCH'){const body=await req.json(),name=String(body.name||'').toLowerCase().replace(/\s+/g,'-').slice(0,32);if(!/^[a-z0-9_-]{1,32}$/.test(name))return j({error:'Nome de canal inválido.'},400);if(one(this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? AND name=?',serverId,name)))return j({error:'Já existe um canal com este nome.'},409);this.c.storage.sql.exec('UPDATE channels SET name=? WHERE server_id=? AND name=?',name,serverId,oldName);this.c.storage.sql.exec('UPDATE messages SET channel=? WHERE server_id=? AND channel=?',name,serverId,oldName);return j({name})}if(req.method==='DELETE'){if(oldName==='geral')return j({error:'O canal #geral não pode ser removido.'},400);this.c.storage.sql.exec('DELETE FROM messages WHERE server_id=? AND channel=?',serverId,oldName);this.c.storage.sql.exec('DELETE FROM channels WHERE server_id=? AND name=?',serverId,oldName);return j({ok:true})}}return communityFetch.call(this,req)};

// Sinalização WebRTC: encaminha ofertas, respostas e ICE apenas entre membros do mesmo servidor.
Servers.prototype.websocket=function(req,serverId,user){
  if(!this.member(serverId,user))return new Response('Sem acesso',{status:403});
  const pair=new WebSocketPair(),client=pair[0],socket=pair[1];socket.accept();
  const rooms=this.voiceSockets||(this.voiceSockets=new Map()),room=rooms.get(serverId)||(rooms.set(serverId,new Set()),rooms.get(serverId)),entry={socket,user,channel:null,joined:false};room.add(entry);
  const emit=(target,message)=>{try{target.send(JSON.stringify(message))}catch{}};
  socket.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data)}catch{return}
    const outgoing={...message,from:{id:user.id,name:user.name,color:user.color}};
    if(message.type==='voice-join'){
      const channel=String(message.channel||'Geral').slice(0,64);
      if(entry.joined&&entry.channel===channel)return;
      if(entry.joined)for(const peer of room)if(peer!==entry&&peer.joined&&peer.channel===entry.channel)emit(peer.socket,{type:'voice-leave',from:outgoing.from});
      entry.channel=channel;entry.joined=true;
      for(const peer of room)if(peer!==entry&&peer.joined&&peer.channel===entry.channel)emit(peer.socket,outgoing);
      return;
    }
    if(message.type==='voice-leave')entry.joined=false;
    if(message.to){for(const peer of room)if(peer.user.id===message.to&&peer.joined&&peer.channel===entry.channel)emit(peer.socket,outgoing);return}
    for(const peer of room)if(peer!==entry&&peer.joined&&peer.channel===entry.channel)emit(peer.socket,outgoing);
  });
  socket.addEventListener('close',()=>{room.delete(entry);for(const peer of room)if(peer.joined&&peer.channel===entry.channel)emit(peer.socket,{type:'voice-leave',from:{id:user.id,name:user.name,color:user.color}});if(!room.size)rooms.delete(serverId)});
  return new Response(null,{status:101,webSocket:client});
};

// Perfis mínimos por servidor para a lista de membros.
const memberFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,PRIMARY KEY(server_id,user_id))');const match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/members$/);if(match){const serverId=match[1];if(!this.member(serverId,user))return j({error:'Sem acesso'},403);if(req.method==='POST'){const body=await req.json();this.c.storage.sql.exec('INSERT OR REPLACE INTO member_profiles VALUES(?,?,?,?)',serverId,user.id,String(body.name||user.name).slice(0,24),String(body.color||user.color||'#5865f2'));return j({ok:true})}if(req.method==='GET')return j({members:[...this.c.storage.sql.exec('SELECT members.user_id,members.role,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(member_profiles.color,"#5865f2") AS color FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id WHERE members.server_id=? ORDER BY members.role DESC,name',serverId)]})}return memberFetch.call(this,req)};

// Administração persistente do servidor, funções e canais de voz.
const managedServerFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){
  const u=new URL(req.url);
  const hasManagedBody=(req.method==='PATCH'&&(/^\/api\/servers\/[\w-]+$/.test(u.pathname)||/^\/api\/servers\/[\w-]+\/(?:voice-channels|members)\/[\w-]+$/.test(u.pathname)))||(req.method==='POST'&&/^\/api\/servers\/[\w-]+\/voice-channels$/.test(u.pathname));
  const managedBody=hasManagedBody?await req.json().catch(()=>({})):null;
  const user=await this.user(req);
  if(!user)return j({error:'Não autenticado'},401);
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_channels(id TEXT PRIMARY KEY,server_id TEXT,name TEXT,created INTEGER,UNIQUE(server_id,name))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  const serverId=u.pathname.match(/^\/api\/servers\/([\w-]+)(?:\/|$)/)?.[1];
  const seedVoiceChannels=id=>{if(!one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? LIMIT 1',id)))this.c.storage.sql.exec('INSERT INTO voice_channels VALUES(?,?,?,?)',crypto.randomUUID(),id,'Geral',Date.now())};
  const server=serverId&&one(this.c.storage.sql.exec('SELECT * FROM servers WHERE id=?',serverId));
  const role=serverId&&this.member(serverId,user);
  const isOwner=!!server&&server.owner===user.id;
  const canManage=isOwner||role==='Admin';
  const management=u.pathname.match(/^\/api\/servers\/([\w-]+)\/manage$/);
  if(management&&req.method==='GET'){
    if(!role)return j({error:'Sem acesso'},403);
    seedVoiceChannels(serverId);
    const members=[...this.c.storage.sql.exec('SELECT members.user_id,members.role,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(member_profiles.color,"#5865f2") AS color FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id WHERE members.server_id=? ORDER BY CASE members.role WHEN "Dono" THEN 0 WHEN "Admin" THEN 1 ELSE 2 END,name',serverId)];
    const voiceChannels=[...this.c.storage.sql.exec('SELECT id,name,created FROM voice_channels WHERE server_id=? ORDER BY created,name',serverId)];
    return j({server,role,isOwner,canManage,members,voiceChannels});
  }
  if(server&&u.pathname===`/api/servers/${serverId}`&&req.method==='PATCH'){
    if(!canManage)return j({error:'Apenas dono ou administradores podem editar o servidor.'},403);
    const body=managedBody,name=String(body.name||'').trim().slice(0,32),icon=[...String(body.icon||'').trim()].slice(0,2).join('');
    if(name.length<2)return j({error:'O nome precisa ter pelo menos 2 caracteres.'},400);
    if(!icon)return j({error:'Escolha um ícone.'},400);
    this.c.storage.sql.exec('UPDATE servers SET name=?,icon=? WHERE id=?',name,icon,serverId);
    return j({server:{...server,name,icon}});
  }
  const voiceCollection=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice-channels$/);
  if(voiceCollection){
    if(!role)return j({error:'Sem acesso'},403);
    seedVoiceChannels(serverId);
    if(req.method==='GET')return j({channels:[...this.c.storage.sql.exec('SELECT id,name,created FROM voice_channels WHERE server_id=? ORDER BY created,name',serverId)]});
    if(req.method==='POST'){
      if(!canManage)return j({error:'Sem permissão.'},403);
      const body=managedBody,name=String(body.name||'').trim().replace(/\s+/g,' ').slice(0,32);
      if(name.length<2)return j({error:'Nome de canal inválido.'},400);
      if(one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? AND lower(name)=lower(?)',serverId,name)))return j({error:'Já existe um canal de voz com esse nome.'},409);
      const channel={id:crypto.randomUUID(),name,created:Date.now()};this.c.storage.sql.exec('INSERT INTO voice_channels VALUES(?,?,?,?)',channel.id,serverId,channel.name,channel.created);return j({channel},201);
    }
  }
  const voiceItem=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice-channels\/([\w-]+)$/);
  if(voiceItem){
    if(!canManage)return j({error:'Sem permissão.'},403);
    const channel=one(this.c.storage.sql.exec('SELECT * FROM voice_channels WHERE id=? AND server_id=?',voiceItem[2],serverId));
    if(!channel)return j({error:'Canal de voz não encontrado.'},404);
    if(req.method==='PATCH'){
      const body=managedBody,name=String(body.name||'').trim().replace(/\s+/g,' ').slice(0,32);
      if(name.length<2)return j({error:'Nome de canal inválido.'},400);
      if(one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? AND lower(name)=lower(?) AND id<>?',serverId,name,channel.id)))return j({error:'Já existe um canal com esse nome.'},409);
      this.c.storage.sql.exec('UPDATE voice_channels SET name=? WHERE id=?',name,channel.id);
      for(const peer of this.voiceSockets?.get(serverId)||[])if(peer.channel===channel.id)peer.channel=channel.id;
      return j({channel:{...channel,name}});
    }
    if(req.method==='DELETE'){
      const count=Number(one(this.c.storage.sql.exec('SELECT count(*) AS total FROM voice_channels WHERE server_id=?',serverId))?.total||0);
      if(count<=1)return j({error:'O servidor precisa manter pelo menos um canal de voz.'},409);
      this.c.storage.sql.exec('DELETE FROM voice_channels WHERE id=?',channel.id);
      for(const peer of [...(this.voiceSockets?.get(serverId)||[])])if(peer.channel===channel.id)peer.socket.close(4001,'Canal removido');
      return j({ok:true});
    }
  }
  const memberItem=u.pathname.match(/^\/api\/servers\/([\w-]+)\/members\/([\w-]+)$/);
  if(memberItem){
    if(!role)return j({error:'Sem acesso'},403);
    const target=one(this.c.storage.sql.exec('SELECT user_id,role FROM members WHERE server_id=? AND user_id=?',serverId,memberItem[2]));
    if(!target)return j({error:'Membro não encontrado.'},404);
    if(target.user_id===server.owner)return j({error:'O dono do servidor não pode ser alterado ou removido.'},409);
    if(req.method==='PATCH'){
      if(!isOwner)return j({error:'Somente o dono pode alterar funções.'},403);
      const body=managedBody,nextRole=String(body.role||'');if(!['Admin','Membro'].includes(nextRole))return j({error:'Função inválida.'},400);
      this.c.storage.sql.exec('UPDATE members SET role=? WHERE server_id=? AND user_id=?',nextRole,serverId,target.user_id);return j({ok:true,role:nextRole});
    }
    if(req.method==='DELETE'){
      if(!canManage||(!isOwner&&target.role==='Admin'))return j({error:'Sem permissão para remover este membro.'},403);
      this.c.storage.sql.exec('DELETE FROM members WHERE server_id=? AND user_id=?',serverId,target.user_id);
      this.c.storage.sql.exec('DELETE FROM member_profiles WHERE server_id=? AND user_id=?',serverId,target.user_id);
      this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,target.user_id);
      for(const peer of [...(this.voiceSockets?.get(serverId)||[])])if(peer.user.id===target.user_id)peer.socket.close(4003,'Removido do servidor');
      return j({ok:true});
    }
  }
  return managedServerFetch.call(this,req);
};

// Sinalização por HTTP para ambientes com proxy, como GitHub Codespaces.
// O áudio continua trafegando diretamente por WebRTC; somente ofertas e ICE passam aqui.
const pollingSignalFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){
  const u=new URL(req.url),match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice-signal$/);
  if(!match)return pollingSignalFetch.call(this,req);
  const user=await this.user(req),serverId=match[1],session=String(u.searchParams.get('session')||'').slice(0,80);
  if(!user)return j({error:'Não autenticado'},401);
  if(!this.member(serverId,user))return j({error:'Sem acesso'},403);
  if(!session)return j({error:'Sessão de voz inválida.'},400);
  const rooms=this.voicePollRooms||(this.voicePollRooms=new Map()),room=rooms.get(serverId)||(rooms.set(serverId,new Map()),rooms.get(serverId));
  const now=Date.now(),emit=(peer,message)=>{peer.events.push(message);if(peer.events.length>100)peer.events.splice(0,peer.events.length-100)},depart=peer=>{room.delete(peer.session);if(peer.joined)for(const other of room.values())if(other.joined&&other.channel===peer.channel)emit(other,{type:'voice-leave',from:{id:peer.user.id,name:peer.user.name,color:peer.user.color}})};
  for(const peer of [...room.values()])if(now-peer.updated>15000)depart(peer);
  let peer=room.get(session);
  if(peer&&peer.user.id!==user.id)return j({error:'Esta sessão de voz pertence a outro usuário.'},403);
  if(req.method==='POST'){
    const message=await req.json().catch(()=>({}));
    if(!peer){peer={session,user,channel:null,joined:false,updated:now,events:[]};room.set(session,peer)}
    peer.updated=now;
    const from={id:user.id,name:user.name,color:user.color},outgoing={...message,from};
    if(message.type==='voice-join'){
      const channel=String(message.channel||'Geral').slice(0,64);
      if(peer.joined&&peer.channel!==channel)for(const other of room.values())if(other!==peer&&other.joined&&other.channel===peer.channel)emit(other,{type:'voice-leave',from});
      peer.channel=channel;peer.joined=true;
      for(const other of room.values())if(other!==peer&&other.joined&&other.channel===channel)emit(other,outgoing);
      return j({ok:true});
    }
    if(message.type==='voice-leave'){depart(peer);if(!room.size)rooms.delete(serverId);return j({ok:true})}
    if(message.to){for(const other of room.values())if(other.user.id===message.to&&other.joined&&other.channel===peer.channel)emit(other,outgoing)}
    else for(const other of room.values())if(other!==peer&&other.joined&&other.channel===peer.channel)emit(other,outgoing);
    return j({ok:true});
  }
  if(req.method==='GET'){
    if(!peer||!peer.joined)return j({error:'A sessão de voz não está conectada.'},409);
    peer.updated=now;const events=peer.events.splice(0);return j({events});
  }
  if(req.method==='DELETE'){if(peer)depart(peer);if(!room.size)rooms.delete(serverId);return j({ok:true})}
  return j({error:'Método inválido.'},405);
};

// A lista lateral reflete tanto conexões WebSocket antigas quanto o transporte HTTP.
const pollingPresenceFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){
  const u=new URL(req.url),match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice$/);
  if(!match||req.method!=='GET')return pollingPresenceFetch.call(this,req);
  const user=await this.user(req),serverId=match[1];
  if(!user)return j({error:'Não autenticado'},401);
  if(!this.member(serverId,user))return j({error:'Sem acesso'},403);
  const users=new Map(),now=Date.now();
  for(const peer of this.voiceSockets?.get(serverId)||[])if(peer.joined&&peer.socket.readyState===1)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});
  const room=this.voicePollRooms?.get(serverId);
  for(const peer of room?.values()||[])if(peer.joined&&now-peer.updated<=15000)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});
  return j({users:[...users.values()].sort((a,b)=>a.name.localeCompare(b.name))});
};
