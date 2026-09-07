const E=new TextEncoder(),j=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}}),one=x=>[...x][0];
const b64=x=>btoa(String.fromCharCode(...x)),unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function hash(p,s){const k=await crypto.subtle.importKey('raw',E.encode(p),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256))}
async function identity(env,token){const r=await env.USERS.get(env.USERS.idFromName('global')).fetch(`https://auth/session?token=${encodeURIComponent(token||'')}`);return r.ok?(await r.json()).user:null}

export default {async fetch(req,env){const u=new URL(req.url),token=req.headers.get('Authorization')?.replace('Bearer ','')||u.searchParams.get('token')||'';if(u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/private/'))return env.USERS.get(env.USERS.idFromName('global')).fetch(req);if(u.pathname==='/api/turn'){const user=await identity(env,token);if(!user)return j({error:'Não autenticado'},401);if(env.METERED_TURN_USERNAME&&env.METERED_TURN_PASSWORD){const auth={username:env.METERED_TURN_USERNAME,credential:env.METERED_TURN_PASSWORD};return j([{urls:'stun:stun.relay.metered.ca:80'},{urls:'turn:global.relay.metered.ca:80',...auth},{urls:'turn:global.relay.metered.ca:80?transport=tcp',...auth},{urls:'turn:global.relay.metered.ca:443',...auth},{urls:'turns:global.relay.metered.ca:443?transport=tcp',...auth}])}if(!env.METERED_TURN_API_KEY)return j({error:'TURN ainda não configurado.'},503);const upstream=await fetch(`https://vixvoice.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_TURN_API_KEY)}`,{signal:AbortSignal.timeout(8000)});if(!upstream.ok)return j({error:`A Metered recusou a chave TURN (${upstream.status}).`},502);const data=await upstream.json();if(!Array.isArray(data)||!data.some(server=>String(server.urls||'').startsWith('turn')))return j({error:'A Metered não retornou servidores TURN.'},502);return j(data)}if(u.pathname.startsWith('/api/servers')){u.searchParams.set('token',token);return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers${u.pathname}${u.search}`,req))}const m=u.pathname.match(/^\/signal\/([\w-]+)$/);if(m)return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers/ws/${m[1]}?token=${encodeURIComponent(token)}`,req));const asset=await env.ASSETS.fetch(req);if(req.method==='GET'&&(u.pathname==='/'||/\.(?:html|js|css)$/.test(u.pathname))){const headers=new Headers(asset.headers);headers.set('cache-control','no-store, max-age=0');return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers})}return asset}};

// Mantida para compatibilidade com implantações antigas que ainda possuem esse Durable Object.
export class Room{constructor(state){this.state=state}fetch(){return j({error:'Esta sala antiga não é mais utilizada.'},410)}}

export class Users{constructor(c){this.c=c;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,avatar_color TEXT,password_hash TEXT,created_at INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER)')}async fetch(r){const u=new URL(r.url);if(r.method==='POST'&&u.pathname==='/api/auth/register'){const x=await r.json(),email=String(x.email||'').trim().toLowerCase(),name=String(x.name||'').trim().slice(0,24),pass=String(x.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||pass.length<8)return j({error:'Informe nome, e-mail válido e senha com 8 caracteres.'},400);if(one(this.c.storage.sql.exec('SELECT id FROM users WHERE email=?',email)))return j({error:'Este e-mail já possui uma conta.'},409);const salt=crypto.getRandomValues(new Uint8Array(16)),id=crypto.randomUUID(),color=['#5865f2','#eb459e','#23a559','#f0b232'][Math.floor(Math.random()*4)];this.c.storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?)',id,email,name,color,`${b64(salt)}.${b64(await hash(pass,salt))}`,Date.now());return this.session({id,email,name,color})}if(r.method==='POST'&&u.pathname==='/api/auth/login'){const x=await r.json(),z=one(this.c.storage.sql.exec('SELECT * FROM users WHERE email=?',String(x.email||'').trim().toLowerCase()));if(!z)return j({error:'E-mail ou senha incorretos.'},401);const[a,h]=z.password_hash.split('.').map(unb64),d=await hash(String(x.password||''),a);if(d.some((v,i)=>v!==h[i]))return j({error:'E-mail ou senha incorretos.'},401);return this.session(z)}if(u.pathname==='/session'){const z=one(this.c.storage.sql.exec('SELECT users.id,users.email,users.display_name AS name,users.avatar_color AS color FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',u.searchParams.get('token'),Date.now()));return z?j({user:z}):j({error:'Sessão expirada'},401)}return j({error:'Rota inexistente'},404)}session(u){const t=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');this.c.storage.sql.exec('INSERT INTO sessions VALUES(?,?,?)',t,u.id,Date.now()+2592000000);return j({token:t,user:{id:u.id,email:u.email,name:u.name||u.display_name,color:u.color||u.avatar_color}})}}

export class Servers{constructor(c,env){this.c=c;this.env=env;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY,name TEXT,icon TEXT,owner TEXT,invite TEXT UNIQUE,created INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS members(server_id TEXT,user_id TEXT,role TEXT,PRIMARY KEY(server_id,user_id))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS channels(server_id TEXT,name TEXT,PRIMARY KEY(server_id,name))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,server_id TEXT,channel TEXT,author TEXT,author_id TEXT,text TEXT,created INTEGER,edited INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS reactions(message_id TEXT,emoji TEXT,user_id TEXT,PRIMARY KEY(message_id,emoji,user_id))');}
  user(req){return identity(this.env,req.headers.get('x-vix-token')||new URL(req.url).searchParams.get('token'))} member(s,u){return one(this.c.storage.sql.exec('SELECT role FROM members WHERE server_id=? AND user_id=?',s,u.id))?.role} admin(s,u){return ['Dono','Admin'].includes(this.member(s,u))}
  async fetch(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);if(u.pathname==='/api/servers'&&req.method==='GET')return j({servers:[...this.c.storage.sql.exec('SELECT servers.* ,members.role FROM servers JOIN members ON servers.id=members.server_id WHERE members.user_id=? ORDER BY created',user.id)]});if(u.pathname==='/api/servers'&&req.method==='POST'){const x=await req.json(),name=String(x.name||'').trim().slice(0,32);if(name.length<2)return j({error:'Nome inválido'},400);const id=crypto.randomUUID(),invite=crypto.randomUUID().slice(0,8);this.c.storage.sql.exec('INSERT INTO servers VALUES(?,?,?,?,?,?)',id,name,name.slice(0,1).toUpperCase(),user.id,invite,Date.now());this.c.storage.sql.exec('INSERT INTO members VALUES(?,?,?)',id,user.id,'Dono');for(const n of ['geral','boas-vindas'])this.c.storage.sql.exec('INSERT INTO channels VALUES(?,?)',id,n);return j({id,name,invite})}const join=u.pathname.match(/^\/api\/servers\/join\/([\w-]+)$/);if(join&&req.method==='POST'){const s=one(this.c.storage.sql.exec('SELECT id FROM servers WHERE invite=?',join[1]));if(!s)return j({error:'Convite inválido'},404);this.c.storage.sql.exec('INSERT OR IGNORE INTO members VALUES(?,?,?)',s.id,user.id,'Membro');return j({id:s.id})}const info=u.pathname.match(/^\/api\/servers\/([\w-]+)$/);if(info&&req.method==='GET'){if(!this.member(info[1],user))return j({error:'Sem acesso'},403);return j({channels:[...this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=?',info[1])],messages:[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? ORDER BY created DESC LIMIT 200',info[1])].reverse()})}const ws=u.pathname.match(/^\/ws\/([\w-]+)$/);if(ws)return this.websocket(req,ws[1],user);return j({error:'Rota inexistente'},404)}
  websocket(req,serverId,user){if(!this.member(serverId,user))return new Response('Sem acesso',{status:403});const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();server.addEventListener('message',e=>this.message(serverId,user,server,e.data));return new Response(null,{status:101,webSocket:client})}message(s,u,peer,raw){let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='chat'){const text=String(m.text||'').trim().slice(0,1000),channel=String(m.channel||'').slice(0,32);if(!text)return;const id=crypto.randomUUID(),created=Date.now();this.c.storage.sql.exec('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',id,s,channel,u.name,u.id,text,created,0);peer.send(JSON.stringify({type:'chat',id,channel,name:u.name,text,created}));return}}}

const PERMISSION_DEFINITIONS=[
  ['VIEW_CHANNELS',1,'Ver canais'],['SEND_MESSAGES',2,'Enviar mensagens'],['CONNECT_VOICE',4,'Conectar à voz'],
  ['MANAGE_SERVER',8,'Gerenciar servidor'],['MANAGE_CHANNELS',16,'Gerenciar canais'],['MANAGE_ROLES',32,'Gerenciar cargos'],
  ['KICK_MEMBERS',64,'Expulsar membros'],['BAN_MEMBERS',128,'Banir membros'],['CREATE_INVITES',256,'Criar convites'],
  ['MANAGE_MESSAGES',512,'Gerenciar mensagens'],['ADMINISTRATOR',1024,'Administrador']
];
const PERMISSIONS=Object.fromEntries(PERMISSION_DEFINITIONS.map(([key,value])=>[key,value])),ALL_PERMISSIONS=PERMISSION_DEFINITIONS.reduce((mask,[,value])=>mask|value,0);
const permissionMask=values=>Array.isArray(values)?values.reduce((mask,key)=>mask|(PERMISSIONS[key]||0),0):Math.max(0,Number(values)||0)&ALL_PERMISSIONS;
Servers.prototype.ensureRoleSystem=function(serverId){
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_roles(id TEXT PRIMARY KEY,server_id TEXT,name TEXT,color TEXT,position INTEGER,permissions INTEGER,builtin INTEGER,UNIQUE(server_id,name))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_roles(server_id TEXT,user_id TEXT,role_id TEXT,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_invites(code TEXT PRIMARY KEY,server_id TEXT,created_by TEXT,max_uses INTEGER,uses INTEGER,expires INTEGER,revoked INTEGER,created INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_bans(server_id TEXT,user_id TEXT,name TEXT,reason TEXT,banned_by TEXT,created INTEGER,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,server_id TEXT,actor_id TEXT,actor_name TEXT,action TEXT,target_id TEXT,target_name TEXT,detail TEXT,created INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence(server_id TEXT,user_id TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  const defaults=[['owner','Criador','#f4c45c',0,ALL_PERMISSIONS],['admin','Administrador','#a9a7ff',10,ALL_PERMISSIONS],['member','Membro','#747d90',100,PERMISSIONS.VIEW_CHANNELS|PERMISSIONS.SEND_MESSAGES|PERMISSIONS.CONNECT_VOICE|PERMISSIONS.CREATE_INVITES]];
  for(const [suffix,name,color,position,permissions] of defaults)this.c.storage.sql.exec('INSERT OR IGNORE INTO server_roles VALUES(?,?,?,?,?,?,1)',`${serverId}-${suffix}`,serverId,name,color,position,permissions);
  this.c.storage.sql.exec('UPDATE server_roles SET name=?,position=0,permissions=? WHERE id=?','Criador',ALL_PERMISSIONS,`${serverId}-owner`);
  for(const member of this.c.storage.sql.exec('SELECT user_id,role FROM members WHERE server_id=?',serverId)){const suffix=member.role==='Dono'?'owner':member.role==='Admin'?'admin':'member';this.c.storage.sql.exec('INSERT OR IGNORE INTO member_roles VALUES(?,?,?)',serverId,member.user_id,`${serverId}-${suffix}`)}
};
Servers.prototype.roleFor=function(serverId,userId){this.ensureRoleSystem(serverId);return one(this.c.storage.sql.exec('SELECT server_roles.* FROM member_roles JOIN server_roles ON server_roles.id=member_roles.role_id WHERE member_roles.server_id=? AND member_roles.user_id=?',serverId,userId))};
Servers.prototype.permissionsFor=function(serverId,userId){const server=one(this.c.storage.sql.exec('SELECT owner FROM servers WHERE id=?',serverId));if(server?.owner===userId)return ALL_PERMISSIONS;const role=this.roleFor(serverId,userId);return Number(role?.permissions||0)};
Servers.prototype.can=function(serverId,user,permission){const permissions=this.permissionsFor(serverId,user.id);return Boolean((permissions&PERMISSIONS.ADMINISTRATOR)||(permissions&PERMISSIONS[permission]))};
Servers.prototype.audit=function(serverId,user,action,targetId='',targetName='',detail=''){this.c.storage.sql.exec('INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),serverId,user.id,user.name,action,String(targetId||''),String(targetName||'').slice(0,64),String(detail||'').slice(0,240),Date.now())};
Servers.prototype.removeMember=function(serverId,userId){this.c.storage.sql.exec('DELETE FROM members WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_roles WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_profiles WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_presence WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,userId);for(const peer of [...(this.voiceSockets?.get(serverId)||[])])if(peer.user.id===userId)peer.socket.close(4003,'Removido do servidor');const room=this.voicePollRooms?.get(serverId);for(const [session,peer] of [...(room?.entries()||[])])if(peer.user.id===userId){room.delete(session);for(const other of room.values())if(other.joined&&other.channel===peer.channel)other.events.push({type:'voice-leave',from:{id:peer.user.id,name:peer.user.name,color:peer.user.color}})}if(room&&!room.size)this.voicePollRooms.delete(serverId)};

const serversFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);const channel=u.pathname.match(/^\/api\/servers\/([\w-]+)\/channels$/),message=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages$/);if(channel&&req.method==='POST'){if(!this.can(channel[1],user,'MANAGE_CHANNELS'))return j({error:'Sem permissão para gerenciar canais.'},403);const x=await req.json(),name=String(x.name||'').toLowerCase().replace(/\s+/g,'-').slice(0,32);if(!/^[a-z0-9_-]{1,32}$/.test(name))return j({error:'Canal inválido.'},400);this.c.storage.sql.exec('INSERT OR IGNORE INTO channels VALUES(?,?)',channel[1],name);this.audit(channel[1],user,'CHANNEL_CREATE',name,name,'Canal de texto criado');return j({name})}if(message&&req.method==='POST'){if(!this.can(message[1],user,'SEND_MESSAGES'))return j({error:'Você não tem permissão para enviar mensagens.'},403);const x=await req.json(),text=String(x.text||'').trim().slice(0,1000),name=String(x.channel||'').slice(0,32);if(!text||!name)return j({error:'Mensagem inválida.'},400);const item={id:crypto.randomUUID(),server_id:message[1],channel:name,author:user.name,author_id:user.id,text,created:Date.now(),edited:0};this.c.storage.sql.exec('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',item.id,item.server_id,item.channel,item.author,item.author_id,item.text,item.created,item.edited);return j({message:item})}return serversFetch.call(this,req)};

const messagesFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);const match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)$/),reaction=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)\/reactions$/);if(match){const message=one(this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND id=?',match[1],match[2]));if(!message)return j({error:'Mensagem não encontrada.'},404);if(req.method==='PATCH'){if(message.author_id!==user.id&&!this.can(match[1],user,'MANAGE_MESSAGES'))return j({error:'Sem permissão.'},403);const x=await req.json(),text=String(x.text||'').trim().slice(0,1000);if(!text)return j({error:'Mensagem inválida.'},400);this.c.storage.sql.exec('UPDATE messages SET text=?,edited=? WHERE id=?',text,Date.now(),message.id);return j({message:{...message,text,edited:Date.now()}})}if(req.method==='DELETE'){if(message.author_id!==user.id&&!this.can(match[1],user,'MANAGE_MESSAGES'))return j({error:'Sem permissão.'},403);this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=?',message.id);this.c.storage.sql.exec('DELETE FROM messages WHERE id=?',message.id);return j({ok:true})}}if(reaction&&req.method==='POST'){const x=await req.json(),emoji=String(x.emoji||'').slice(0,8);if(!emoji)return j({error:'Reação inválida.'},400);const exists=one(this.c.storage.sql.exec('SELECT user_id FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',reaction[2],emoji,user.id));if(exists)this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',reaction[2],emoji,user.id);else this.c.storage.sql.exec('INSERT INTO reactions VALUES(?,?,?)',reaction[2],emoji,user.id);const count=[...this.c.storage.sql.exec('SELECT user_id FROM reactions WHERE message_id=? AND emoji=?',reaction[2],emoji)].length;return j({emoji,count,active:!exists})}return messagesFetch.call(this,req)};

// A interface recebe somente os nomes dos canais, não as linhas do banco.
const normalizedServerFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),response=await normalizedServerFetch.call(this,req);if(req.method==='GET'&&/^\/api\/servers\/[\w-]+$/.test(u.pathname)&&response.ok){const data=await response.json();data.channels=(data.channels||[]).map(channel=>typeof channel==='string'?channel:channel.name);return j(data)}return response};

// Presença de voz e administração de canais por dono/admin.
const communityFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');const voice=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice$/),channel=u.pathname.match(/^\/api\/servers\/([\w-]+)\/channels\/([\w-]+)$/);if(voice){const serverId=voice[1];if(!this.can(serverId,user,'CONNECT_VOICE'))return j({error:'Sem permissão para conectar à voz.'},403);if(req.method==='GET'){const users=new Map();for(const peer of this.voiceSockets?.get(serverId)||[]){if(peer.joined&&peer.socket.readyState===1)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});}return j({users:[...users.values()].sort((a,b)=>a.name.localeCompare(b.name))})}if(req.method==='POST'){const body=await req.json(),name=String(body.channel||'Geral').slice(0,64);this.c.storage.sql.exec('INSERT OR REPLACE INTO voice_presence VALUES(?,?,?,?,?,?)',serverId,name,user.id,user.name,user.color||'#5865f2',Date.now());return j({ok:true})}if(req.method==='DELETE'){this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,user.id);return j({ok:true})}}if(channel){const serverId=channel[1],oldName=channel[2];if(!this.can(serverId,user,'MANAGE_CHANNELS'))return j({error:'Sem permissão para gerenciar canais.'},403);if(req.method==='PATCH'){const body=await req.json(),name=String(body.name||'').toLowerCase().replace(/\s+/g,'-').slice(0,32);if(!/^[a-z0-9_-]{1,32}$/.test(name))return j({error:'Nome de canal inválido.'},400);if(one(this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? AND name=?',serverId,name)))return j({error:'Já existe um canal com este nome.'},409);this.c.storage.sql.exec('UPDATE channels SET name=? WHERE server_id=? AND name=?',name,serverId,oldName);this.c.storage.sql.exec('UPDATE messages SET channel=? WHERE server_id=? AND channel=?',name,serverId,oldName);return j({name})}if(req.method==='DELETE'){if(oldName==='geral')return j({error:'O canal #geral não pode ser removido.'},400);this.c.storage.sql.exec('DELETE FROM messages WHERE server_id=? AND channel=?',serverId,oldName);this.c.storage.sql.exec('DELETE FROM channels WHERE server_id=? AND name=?',serverId,oldName);return j({ok:true})}}return communityFetch.call(this,req)};

// Sinalização WebRTC: encaminha ofertas, respostas e ICE apenas entre membros do mesmo servidor.
Servers.prototype.websocket=function(req,serverId,user){
  if(!this.can(serverId,user,'CONNECT_VOICE'))return new Response('Sem permissão para conectar à voz',{status:403});
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

// Perfis e presença recente para a lista de membros.
const memberFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence(server_id TEXT,user_id TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');const match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/members$/);if(match){const serverId=match[1];if(!this.member(serverId,user))return j({error:'Sem acesso'},403);this.ensureRoleSystem(serverId);if(req.method==='POST'){const body=await req.json(),now=Date.now();this.c.storage.sql.exec('INSERT OR REPLACE INTO member_profiles(server_id,user_id,name,color) VALUES(?,?,?,?)',serverId,user.id,String(body.name||user.name).slice(0,24),String(body.color||user.color||'#5865f2'));this.c.storage.sql.exec('INSERT OR REPLACE INTO member_presence(server_id,user_id,updated) VALUES(?,?,?)',serverId,user.id,now);return j({ok:true,updated:now})}if(req.method==='GET'){const activeSince=Date.now()-65000;return j({members:[...this.c.storage.sql.exec('SELECT members.user_id,COALESCE(server_roles.name,members.role) AS role,server_roles.id AS role_id,server_roles.color AS role_color,COALESCE(server_roles.position,100) AS role_position,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(member_profiles.color,"#5865f2") AS color,COALESCE(member_presence.updated,0) AS last_seen,CASE WHEN COALESCE(member_presence.updated,0)>=? THEN 1 ELSE 0 END AS online FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id LEFT JOIN member_presence ON members.server_id=member_presence.server_id AND members.user_id=member_presence.user_id LEFT JOIN member_roles ON members.server_id=member_roles.server_id AND members.user_id=member_roles.user_id LEFT JOIN server_roles ON server_roles.id=member_roles.role_id WHERE members.server_id=? ORDER BY COALESCE(server_roles.position,100),name',activeSince,serverId)]})}}return memberFetch.call(this,req)};

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
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence(server_id TEXT,user_id TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  const serverId=u.pathname.match(/^\/api\/servers\/([\w-]+)(?:\/|$)/)?.[1];
  const seedVoiceChannels=id=>{if(!one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? LIMIT 1',id)))this.c.storage.sql.exec('INSERT INTO voice_channels VALUES(?,?,?,?)',crypto.randomUUID(),id,'Geral',Date.now())};
  const server=serverId&&one(this.c.storage.sql.exec('SELECT * FROM servers WHERE id=?',serverId));
  const role=serverId&&this.member(serverId,user);
  const isOwner=!!server&&server.owner===user.id;
  const canManage=this.can(serverId,user,'MANAGE_SERVER');
  const canManageChannels=this.can(serverId,user,'MANAGE_CHANNELS');
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
      if(!canManageChannels)return j({error:'Sem permissão para gerenciar canais.'},403);
      const body=managedBody,name=String(body.name||'').trim().replace(/\s+/g,' ').slice(0,32);
      if(name.length<2)return j({error:'Nome de canal inválido.'},400);
      if(one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? AND lower(name)=lower(?)',serverId,name)))return j({error:'Já existe um canal de voz com esse nome.'},409);
      const channel={id:crypto.randomUUID(),name,created:Date.now()};this.c.storage.sql.exec('INSERT INTO voice_channels VALUES(?,?,?,?)',channel.id,serverId,channel.name,channel.created);return j({channel},201);
    }
  }
  const voiceItem=u.pathname.match(/^\/api\/servers\/([\w-]+)\/voice-channels\/([\w-]+)$/);
  if(voiceItem){
    if(!canManageChannels)return j({error:'Sem permissão para gerenciar canais.'},403);
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
      this.c.storage.sql.exec('DELETE FROM member_presence WHERE server_id=? AND user_id=?',serverId,target.user_id);
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
  if(!this.can(serverId,user,'CONNECT_VOICE'))return j({error:'Sem permissão para conectar à voz.'},403);
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
  if(!this.can(serverId,user,'CONNECT_VOICE'))return j({error:'Sem permissão para conectar à voz.'},403);
  const users=new Map(),now=Date.now();
  for(const peer of this.voiceSockets?.get(serverId)||[])if(peer.joined&&peer.socket.readyState===1)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});
  const room=this.voicePollRooms?.get(serverId);
  for(const peer of room?.values()||[])if(peer.joined&&now-peer.updated<=15000)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,channel:peer.channel||'Geral'});
  return j({users:[...users.values()].sort((a,b)=>a.name.localeCompare(b.name))});
};

// Governança do servidor: cargos, permissões, convites, moderação e auditoria.
const governanceFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){
  const u=new URL(req.url),join=u.pathname.match(/^\/api\/servers\/join\/([\w-]+)$/);
  const user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);
  if(join&&req.method==='POST'){
    this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_invites(code TEXT PRIMARY KEY,server_id TEXT,created_by TEXT,max_uses INTEGER,uses INTEGER,expires INTEGER,revoked INTEGER,created INTEGER)');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_bans(server_id TEXT,user_id TEXT,name TEXT,reason TEXT,banned_by TEXT,created INTEGER,PRIMARY KEY(server_id,user_id))');
    const code=join[1],managed=one(this.c.storage.sql.exec('SELECT * FROM server_invites WHERE code=?',code)),legacy=managed?null:one(this.c.storage.sql.exec('SELECT id AS server_id FROM servers WHERE invite=?',code)),serverId=managed?.server_id||legacy?.server_id;
    if(!serverId)return j({error:'Convite inválido.'},404);this.ensureRoleSystem(serverId);
    if(managed&&(managed.revoked||managed.expires&&managed.expires<Date.now()||managed.max_uses&&managed.uses>=managed.max_uses))return j({error:'Este convite expirou ou não está mais disponível.'},410);
    if(one(this.c.storage.sql.exec('SELECT user_id FROM server_bans WHERE server_id=? AND user_id=?',serverId,user.id)))return j({error:'Você foi banido deste servidor.'},403);
    const existed=!!this.member(serverId,user);this.c.storage.sql.exec('INSERT OR IGNORE INTO members VALUES(?,?,?)',serverId,user.id,'Membro');this.c.storage.sql.exec('INSERT OR IGNORE INTO member_roles VALUES(?,?,?)',serverId,user.id,`${serverId}-member`);
    if(managed&&!existed)this.c.storage.sql.exec('UPDATE server_invites SET uses=uses+1 WHERE code=?',code);if(!existed)this.audit(serverId,user,'MEMBER_JOIN',user.id,user.name,'Entrou por convite');return j({id:serverId});
  }
  if(u.pathname==='/api/servers'&&req.method==='GET'){const response=await governanceFetch.call(this,req);if(!response.ok)return response;const data=await response.json();for(const item of data.servers||[])delete item.invite;return j(data)}
  const serverId=u.pathname.match(/^\/api\/servers\/([\w-]+)(?:\/|$)/)?.[1];if(!serverId)return governanceFetch.call(this,req);
  if(!this.member(serverId,user))return governanceFetch.call(this,req);this.ensureRoleSystem(serverId);
  const server=one(this.c.storage.sql.exec('SELECT * FROM servers WHERE id=?',serverId)),isOwner=server?.owner===user.id,currentRole=this.roleFor(serverId,user.id),can=permission=>this.can(serverId,user,permission);
  if(u.pathname===`/api/servers/${serverId}`&&req.method==='GET'){if(!can('VIEW_CHANNELS'))return j({error:'Você não tem permissão para ver os canais deste servidor.'},403);const response=await governanceFetch.call(this,req);if(!response.ok)return response;const data=await response.json();data.capabilities={sendMessages:can('SEND_MESSAGES'),connectVoice:can('CONNECT_VOICE'),manageChannels:can('MANAGE_CHANNELS'),createInvites:can('CREATE_INVITES')};return j(data)}
  const roleCollection=u.pathname===`/api/servers/${serverId}/roles`,roleItem=u.pathname.match(new RegExp(`^/api/servers/${serverId}/roles/([\\w-]+)$`));
  const inviteCollection=u.pathname===`/api/servers/${serverId}/invites`,inviteItem=u.pathname.match(new RegExp(`^/api/servers/${serverId}/invites/([\\w-]+)$`));
  const banCollection=u.pathname===`/api/servers/${serverId}/bans`,banItem=u.pathname.match(new RegExp(`^/api/servers/${serverId}/bans/([\\w-]+)$`));
  const memberItem=u.pathname.match(new RegExp(`^/api/servers/${serverId}/members/([\\w-]+)(?:/(kick|ban))?$`));
  if(u.pathname===`/api/servers/${serverId}/manage`&&req.method==='GET'){
    const response=await governanceFetch.call(this,req);if(!response.ok)return response;const data=await response.json();
    delete data.server.invite;data.roles=[...this.c.storage.sql.exec('SELECT * FROM server_roles WHERE server_id=? ORDER BY position,name',serverId)];
    data.members=[...this.c.storage.sql.exec('SELECT members.user_id,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(member_profiles.color,"#5865f2") AS color,server_roles.id AS role_id,server_roles.name AS role,server_roles.color AS role_color,server_roles.position AS role_position FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id LEFT JOIN member_roles ON members.server_id=member_roles.server_id AND members.user_id=member_roles.user_id LEFT JOIN server_roles ON server_roles.id=member_roles.role_id WHERE members.server_id=? ORDER BY server_roles.position,name',serverId)];
    data.permissions=PERMISSION_DEFINITIONS.map(([key,value,label])=>({key,value,label}));data.currentRole=currentRole;data.capabilities={manageServer:can('MANAGE_SERVER'),manageChannels:can('MANAGE_CHANNELS'),manageRoles:can('MANAGE_ROLES'),kickMembers:can('KICK_MEMBERS'),banMembers:can('BAN_MEMBERS'),createInvites:can('CREATE_INVITES'),viewAudit:can('MANAGE_SERVER')||can('BAN_MEMBERS')};
    data.invites=data.capabilities.createInvites?[...this.c.storage.sql.exec('SELECT code,max_uses,uses,expires,revoked,created FROM server_invites WHERE server_id=? ORDER BY created DESC',serverId)]:[];data.bans=data.capabilities.banMembers?[...this.c.storage.sql.exec('SELECT user_id,name,reason,created FROM server_bans WHERE server_id=? ORDER BY created DESC',serverId)]:[];data.audit=data.capabilities.viewAudit?[...this.c.storage.sql.exec('SELECT actor_name,action,target_name,detail,created FROM audit_logs WHERE server_id=? ORDER BY created DESC LIMIT 60',serverId)]:[];
    data.canManage=Object.values(data.capabilities).some(Boolean);return j(data);
  }
  if(roleCollection){
    if(req.method==='GET')return j({roles:[...this.c.storage.sql.exec('SELECT * FROM server_roles WHERE server_id=? ORDER BY position,name',serverId)]});
    if(req.method==='POST'){if(!can('MANAGE_ROLES'))return j({error:'Sem permissão para criar cargos.'},403);const body=await req.json(),name=String(body.name||'').trim().slice(0,32),color=/^#[0-9a-f]{6}$/i.test(body.color)?body.color:'#5865f2';if(name.length<2)return j({error:'O cargo precisa ter pelo menos 2 caracteres.'},400);if(one(this.c.storage.sql.exec('SELECT id FROM server_roles WHERE server_id=? AND lower(name)=lower(?)',serverId,name)))return j({error:'Já existe um cargo com esse nome.'},409);const role={id:crypto.randomUUID(),server_id:serverId,name,color,position:50,permissions:permissionMask(body.permissions),builtin:0};this.c.storage.sql.exec('INSERT INTO server_roles VALUES(?,?,?,?,?,?,0)',role.id,serverId,role.name,role.color,role.position,role.permissions);this.audit(serverId,user,'ROLE_CREATE',role.id,role.name,'Cargo criado');return j({role},201)}
  }
  if(roleItem){const role=one(this.c.storage.sql.exec('SELECT * FROM server_roles WHERE id=? AND server_id=?',roleItem[1],serverId));if(!role)return j({error:'Cargo não encontrado.'},404);if(!can('MANAGE_ROLES'))return j({error:'Sem permissão para gerenciar cargos.'},403);if(!isOwner&&Number(role.position)<=Number(currentRole?.position??999))return j({error:'Você só pode editar cargos abaixo do seu.'},403);
    if(req.method==='PATCH'){if(role.position===0&&!isOwner)return j({error:'Somente o criador pode personalizar esse cargo.'},403);const body=await req.json(),creatorRole=Number(role.position)===0,name=creatorRole?'Criador':role.builtin?role.name:String(body.name||role.name).trim().slice(0,32),color=/^#[0-9a-f]{6}$/i.test(body.color)?body.color:role.color,permissions=creatorRole?ALL_PERMISSIONS:permissionMask(body.permissions);if(name.length<2)return j({error:'Nome de cargo inválido.'},400);this.c.storage.sql.exec('UPDATE server_roles SET name=?,color=?,permissions=? WHERE id=?',name,color,permissions,role.id);this.audit(serverId,user,'ROLE_UPDATE',role.id,name,creatorRole?'Aparência do cargo atualizada':'Permissões atualizadas');return j({role:{...role,name,color,permissions}})}
    if(req.method==='DELETE'){if(role.builtin)return j({error:'Os cargos padrão não podem ser excluídos.'},409);const fallback=`${serverId}-member`;this.c.storage.sql.exec('UPDATE member_roles SET role_id=? WHERE server_id=? AND role_id=?',fallback,serverId,role.id);this.c.storage.sql.exec('DELETE FROM server_roles WHERE id=?',role.id);this.audit(serverId,user,'ROLE_DELETE',role.id,role.name,'Cargo excluído');return j({ok:true})}
  }
  if(memberItem){const targetId=memberItem[1],action=memberItem[2],target=one(this.c.storage.sql.exec('SELECT members.user_id,COALESCE(member_profiles.name,"Membro") AS name,server_roles.id AS role_id,server_roles.name AS role,server_roles.position FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id LEFT JOIN member_roles ON members.server_id=member_roles.server_id AND members.user_id=member_roles.user_id LEFT JOIN server_roles ON server_roles.id=member_roles.role_id WHERE members.server_id=? AND members.user_id=?',serverId,targetId));if(!target)return j({error:'Membro não encontrado.'},404);if(targetId===server.owner)return j({error:'O dono do servidor não pode ser moderado.'},409);const aboveTarget=isOwner||Number(currentRole?.position??999)<Number(target.position??999);if(!aboveTarget)return j({error:'Você só pode gerenciar cargos abaixo do seu.'},403);
    if(req.method==='PATCH'&&!action){if(!can('MANAGE_ROLES'))return j({error:'Sem permissão para atribuir cargos.'},403);const body=await req.json(),next=one(this.c.storage.sql.exec('SELECT * FROM server_roles WHERE id=? AND server_id=?',String(body.role_id||''),serverId));if(!next)return j({error:'Cargo inválido.'},400);if(Number(next.position)===0)return j({error:'O cargo Criador é exclusivo de quem criou o servidor.'},409);if(!isOwner&&Number(next.position)<=Number(currentRole?.position??999))return j({error:'Você não pode atribuir esse cargo.'},403);this.c.storage.sql.exec('INSERT OR REPLACE INTO member_roles VALUES(?,?,?)',serverId,targetId,next.id);this.c.storage.sql.exec('UPDATE members SET role=? WHERE server_id=? AND user_id=?',next.name==='Administrador'?'Admin':'Membro',serverId,targetId);this.audit(serverId,user,'MEMBER_ROLE',targetId,target.name,`Cargo: ${next.name}`);return j({ok:true,role:next.name})}
    if(req.method==='DELETE'||req.method==='POST'&&action==='kick'){if(!can('KICK_MEMBERS'))return j({error:'Sem permissão para expulsar membros.'},403);this.removeMember(serverId,targetId);this.audit(serverId,user,'MEMBER_KICK',targetId,target.name,'Membro expulso');return j({ok:true})}
    if(req.method==='POST'&&action==='ban'){if(!can('BAN_MEMBERS'))return j({error:'Sem permissão para banir membros.'},403);const body=await req.json().catch(()=>({})),reason=String(body.reason||'Sem motivo informado').trim().slice(0,160);this.c.storage.sql.exec('INSERT OR REPLACE INTO server_bans VALUES(?,?,?,?,?,?)',serverId,targetId,target.name,reason,user.id,Date.now());this.removeMember(serverId,targetId);this.audit(serverId,user,'MEMBER_BAN',targetId,target.name,reason);return j({ok:true})}
  }
  if(inviteCollection){if(req.method==='GET'){if(!can('CREATE_INVITES'))return j({error:'Sem permissão para ver convites.'},403);return j({invites:[...this.c.storage.sql.exec('SELECT code,max_uses,uses,expires,revoked,created FROM server_invites WHERE server_id=? ORDER BY created DESC',serverId)]})}if(req.method==='POST'){if(!can('CREATE_INVITES'))return j({error:'Sem permissão para criar convites.'},403);const body=await req.json(),maxUses=Math.max(0,Math.min(1000,Number(body.max_uses)||0)),hours=Math.max(0,Math.min(8760,Number(body.expires_hours)||0)),invite={code:crypto.randomUUID().replaceAll('-','').slice(0,10),max_uses:maxUses,uses:0,expires:hours?Date.now()+hours*3600000:0,revoked:0,created:Date.now()};this.c.storage.sql.exec('INSERT INTO server_invites VALUES(?,?,?,?,?,?,?,?)',invite.code,serverId,user.id,invite.max_uses,0,invite.expires,0,invite.created);this.audit(serverId,user,'INVITE_CREATE',invite.code,invite.code,`Limite: ${maxUses||'sem limite'}`);return j({invite},201)}}
  if(inviteItem&&req.method==='DELETE'){if(!can('CREATE_INVITES'))return j({error:'Sem permissão para revogar convites.'},403);this.c.storage.sql.exec('UPDATE server_invites SET revoked=1 WHERE server_id=? AND code=?',serverId,inviteItem[1]);this.audit(serverId,user,'INVITE_REVOKE',inviteItem[1],inviteItem[1],'Convite revogado');return j({ok:true})}
  if(banCollection&&req.method==='GET'){if(!can('BAN_MEMBERS'))return j({error:'Sem permissão para ver banimentos.'},403);return j({bans:[...this.c.storage.sql.exec('SELECT user_id,name,reason,created FROM server_bans WHERE server_id=? ORDER BY created DESC',serverId)]})}
  if(banItem&&req.method==='DELETE'){if(!can('BAN_MEMBERS'))return j({error:'Sem permissão para remover banimentos.'},403);const ban=one(this.c.storage.sql.exec('SELECT name FROM server_bans WHERE server_id=? AND user_id=?',serverId,banItem[1]));if(!ban)return j({error:'Banimento não encontrado.'},404);this.c.storage.sql.exec('DELETE FROM server_bans WHERE server_id=? AND user_id=?',serverId,banItem[1]);this.audit(serverId,user,'MEMBER_UNBAN',banItem[1],ban.name,'Banimento removido');return j({ok:true})}
  if(u.pathname===`/api/servers/${serverId}/audit`&&req.method==='GET'){if(!can('MANAGE_SERVER')&&!can('BAN_MEMBERS'))return j({error:'Sem permissão para ver o registro.'},403);return j({audit:[...this.c.storage.sql.exec('SELECT actor_name,action,target_name,detail,created FROM audit_logs WHERE server_id=? ORDER BY created DESC LIMIT 100',serverId)]})}
  return governanceFetch.call(this,req);
};

// Saúde interna: confirma que o Worker e o banco de contas respondem sem expor dados.
const usersHealthFetch=Users.prototype.fetch;
Users.prototype.fetch=async function(req){
  const u=new URL(req.url);
  if(u.pathname==='/api/auth/health'&&req.method==='GET'){
    try{
      one(this.c.storage.sql.exec('SELECT 1 AS healthy'));
      return new Response(JSON.stringify({status:'ok',time:new Date().toISOString()}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    }catch(error){
      console.error('Falha na verificação de saúde',error);
      return new Response(JSON.stringify({status:'unhealthy'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
  }
  return usersHealthFetch.call(this,req);
};

// Área privada global: amizades, mensagens diretas, presença e sinalização WebRTC.
const authenticatedUsersFetch=Users.prototype.fetch;
Users.prototype.ensurePrivateSystem=function(){
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS friend_requests(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,status TEXT,created INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS friendships(user_a TEXT,user_b TEXT,created INTEGER,PRIMARY KEY(user_a,user_b))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS direct_messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,text TEXT,created INTEGER,read_at INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS private_presence(user_id TEXT PRIMARY KEY,updated INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS private_call_events(id TEXT PRIMARY KEY,target_id TEXT,sender_id TEXT,payload TEXT,created INTEGER)');
};
Users.prototype.privateUser=function(req){
  const u=new URL(req.url),token=req.headers.get('Authorization')?.replace('Bearer ','')||u.searchParams.get('token')||'';
  return one(this.c.storage.sql.exec('SELECT users.id,users.email,users.display_name AS name,users.avatar_color AS color FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()));
};
Users.prototype.privateFriends=function(a,b){
  const [x,y]=[a,b].sort();
  return !!one(this.c.storage.sql.exec('SELECT 1 AS ok FROM friendships WHERE user_a=? AND user_b=?',x,y));
};
Users.prototype.fetch=async function(req){
  const u=new URL(req.url);
  if(!u.pathname.startsWith('/api/private/'))return authenticatedUsersFetch.call(this,req);
  this.ensurePrivateSystem();
  const user=this.privateUser(req);if(!user)return j({error:'Não autenticado'},401);
  const now=Date.now();
  this.c.storage.sql.exec('INSERT OR REPLACE INTO private_presence VALUES(?,?)',user.id,now);
  this.c.storage.sql.exec('DELETE FROM private_call_events WHERE created<?',now-120000);
  if(u.pathname==='/api/private/home'&&req.method==='GET'){
    const links=[...this.c.storage.sql.exec('SELECT user_a,user_b FROM friendships WHERE user_a=? OR user_b=?',user.id,user.id)],friends=[];
    for(const link of links){
      const id=link.user_a===user.id?link.user_b:link.user_a,person=one(this.c.storage.sql.exec('SELECT id,display_name AS name,avatar_color AS color FROM users WHERE id=?',id));if(!person)continue;
      const presence=one(this.c.storage.sql.exec('SELECT updated FROM private_presence WHERE user_id=?',id)),unread=one(this.c.storage.sql.exec('SELECT COUNT(*) AS count FROM direct_messages WHERE sender_id=? AND receiver_id=? AND read_at IS NULL',id,user.id));
      const last=one(this.c.storage.sql.exec('SELECT text,created FROM direct_messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created DESC LIMIT 1',user.id,id,id,user.id));
      friends.push({...person,online:!!presence&&now-presence.updated<65000,unread:Number(unread?.count||0),last_message:last?.text||'',last_message_at:last?.created||0});
    }
    friends.sort((a,b)=>Number(b.online)-Number(a.online)||b.last_message_at-a.last_message_at||a.name.localeCompare(b.name));
    const incoming=[...this.c.storage.sql.exec('SELECT friend_requests.id,friend_requests.created,users.id AS user_id,users.display_name AS name,users.avatar_color AS color FROM friend_requests JOIN users ON users.id=friend_requests.sender_id WHERE receiver_id=? AND status=? ORDER BY friend_requests.created DESC',user.id,'pending')];
    const outgoing=[...this.c.storage.sql.exec('SELECT friend_requests.id,friend_requests.created,users.id AS user_id,users.display_name AS name,users.avatar_color AS color FROM friend_requests JOIN users ON users.id=friend_requests.receiver_id WHERE sender_id=? AND status=? ORDER BY friend_requests.created DESC',user.id,'pending')];
    return j({friends,incoming,outgoing});
  }
  if(u.pathname==='/api/private/friends'&&req.method==='POST'){
    const body=await req.json().catch(()=>({})),email=String(body.email||'').trim().toLowerCase(),target=one(this.c.storage.sql.exec('SELECT id,display_name AS name FROM users WHERE email=?',email));
    if(!target)return j({error:'Nenhum usuário foi encontrado com esse e-mail.'},404);
    if(target.id===user.id)return j({error:'Você não pode adicionar a si mesmo.'},400);
    if(this.privateFriends(user.id,target.id))return j({error:'Essa pessoa já está na sua lista de amigos.'},409);
    const reverse=one(this.c.storage.sql.exec('SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status=?',target.id,user.id,'pending'));
    if(reverse){const [a,b]=[user.id,target.id].sort();this.c.storage.sql.exec('INSERT OR IGNORE INTO friendships VALUES(?,?,?)',a,b,now);this.c.storage.sql.exec('DELETE FROM friend_requests WHERE id=?',reverse.id);return j({ok:true,accepted:true});}
    if(one(this.c.storage.sql.exec('SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status=?',user.id,target.id,'pending')))return j({error:'A solicitação já foi enviada.'},409);
    const id=crypto.randomUUID();this.c.storage.sql.exec('INSERT INTO friend_requests VALUES(?,?,?,?,?)',id,user.id,target.id,'pending',now);return j({ok:true,request:{id,name:target.name}},201);
  }
  const requestMatch=u.pathname.match(/^\/api\/private\/requests\/([\w-]+)(?:\/(accept))?$/);
  if(requestMatch&&req.method==='POST'&&requestMatch[2]==='accept'){
    const request=one(this.c.storage.sql.exec('SELECT * FROM friend_requests WHERE id=? AND receiver_id=? AND status=?',requestMatch[1],user.id,'pending'));if(!request)return j({error:'Solicitação não encontrada.'},404);
    const [a,b]=[request.sender_id,user.id].sort();this.c.storage.sql.exec('INSERT OR IGNORE INTO friendships VALUES(?,?,?)',a,b,now);this.c.storage.sql.exec('DELETE FROM friend_requests WHERE id=?',request.id);return j({ok:true});
  }
  if(requestMatch&&req.method==='DELETE'){
    const request=one(this.c.storage.sql.exec('SELECT * FROM friend_requests WHERE id=? AND (sender_id=? OR receiver_id=?)',requestMatch[1],user.id,user.id));if(!request)return j({error:'Solicitação não encontrada.'},404);
    this.c.storage.sql.exec('DELETE FROM friend_requests WHERE id=?',request.id);return j({ok:true});
  }
  const friendMatch=u.pathname.match(/^\/api\/private\/friends\/([\w-]+)$/);
  if(friendMatch&&req.method==='DELETE'){
    const target=friendMatch[1],[a,b]=[user.id,target].sort();this.c.storage.sql.exec('DELETE FROM friendships WHERE user_a=? AND user_b=?',a,b);this.c.storage.sql.exec('DELETE FROM direct_messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)',user.id,target,target,user.id);return j({ok:true});
  }
  const messagesMatch=u.pathname.match(/^\/api\/private\/messages\/([\w-]+)$/);
  if(messagesMatch){
    const target=messagesMatch[1];if(!this.privateFriends(user.id,target))return j({error:'Essa conversa exige uma amizade aceita.'},403);
    if(req.method==='GET'){const after=Math.max(0,Number(u.searchParams.get('after'))||0);this.c.storage.sql.exec('UPDATE direct_messages SET read_at=? WHERE sender_id=? AND receiver_id=? AND read_at IS NULL',now,target,user.id);return j({messages:[...this.c.storage.sql.exec('SELECT id,sender_id,receiver_id,text,created,read_at FROM direct_messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND created>? ORDER BY created ASC LIMIT 250',user.id,target,target,user.id,after)]});}
    if(req.method==='POST'){const body=await req.json().catch(()=>({})),text=String(body.text||'').trim().slice(0,2000);if(!text)return j({error:'Digite uma mensagem.'},400);const message={id:crypto.randomUUID(),sender_id:user.id,receiver_id:target,text,created:now,read_at:null};this.c.storage.sql.exec('INSERT INTO direct_messages VALUES(?,?,?,?,?,NULL)',message.id,user.id,target,text,now);return j({message},201);}
  }
  if(u.pathname==='/api/private/signal'){
    if(req.method==='GET'){const events=[...this.c.storage.sql.exec('SELECT id,sender_id,payload,created FROM private_call_events WHERE target_id=? ORDER BY created ASC LIMIT 100',user.id)];if(events.length)for(const event of events)this.c.storage.sql.exec('DELETE FROM private_call_events WHERE id=?',event.id);return j({events:events.map(event=>({id:event.id,from:event.sender_id,created:event.created,...JSON.parse(event.payload)}))});}
    if(req.method==='POST'){const body=await req.json().catch(()=>({})),target=String(body.to||''),allowed=new Set(['call-offer','call-answer','call-ice','call-hangup','call-busy']);if(!allowed.has(body.type))return j({error:'Sinal de chamada inválido.'},400);if(!this.privateFriends(user.id,target))return j({error:'Chamadas privadas exigem uma amizade aceita.'},403);const payload=JSON.stringify({...body,to:undefined});if(payload.length>30000)return j({error:'Sinal de chamada muito grande.'},413);this.c.storage.sql.exec('INSERT INTO private_call_events VALUES(?,?,?,?,?)',crypto.randomUUID(),target,user.id,payload,now);return j({ok:true});}
    if(req.method==='DELETE'){this.c.storage.sql.exec('DELETE FROM private_call_events WHERE target_id=?',user.id);return j({ok:true});}
  }
  return j({error:'Rota privada inexistente'},404);
};
