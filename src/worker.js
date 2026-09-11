const E=new TextEncoder(),j=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}}),one=x=>[...x][0];
const b64=x=>btoa(String.fromCharCode(...x)),unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
const addColumn=(sql,table,column)=>{try{sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`)}catch{}};
const safeAvatar=value=>{const avatar=String(value||'');return avatar.length<=900000&&/^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(avatar)?avatar:''};
const safeBanner=value=>{const banner=String(value||'');return banner.length<=2200000&&/^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(banner)?banner:''};
async function hash(p,s){const k=await crypto.subtle.importKey('raw',E.encode(p),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256))}
async function identity(env,token){const r=await env.USERS.get(env.USERS.idFromName('global')).fetch(`https://auth/session?token=${encodeURIComponent(token||'')}`);return r.ok?(await r.json()).user:null}

export default {async fetch(req,env){const u=new URL(req.url),token=req.headers.get('Authorization')?.replace('Bearer ','')||u.searchParams.get('token')||'';if(u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/private/')||u.pathname.startsWith('/api/profile')||u.pathname.startsWith('/api/account/'))return env.USERS.get(env.USERS.idFromName('global')).fetch(req);if(u.pathname==='/api/turn'){const user=await identity(env,token);if(!user)return j({error:'Não autenticado'},401);if(env.METERED_TURN_USERNAME&&env.METERED_TURN_PASSWORD){const auth={username:env.METERED_TURN_USERNAME,credential:env.METERED_TURN_PASSWORD};return j([{urls:'stun:stun.relay.metered.ca:80'},{urls:'turn:global.relay.metered.ca:80',...auth},{urls:'turn:global.relay.metered.ca:80?transport=tcp',...auth},{urls:'turn:global.relay.metered.ca:443',...auth},{urls:'turns:global.relay.metered.ca:443?transport=tcp',...auth}])}if(!env.METERED_TURN_API_KEY)return j({error:'TURN ainda não configurado.'},503);const upstream=await fetch(`https://vixvoice.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_TURN_API_KEY)}`,{signal:AbortSignal.timeout(8000)});if(!upstream.ok)return j({error:`A Metered recusou a chave TURN (${upstream.status}).`},502);const data=await upstream.json();if(!Array.isArray(data)||!data.some(server=>String(server.urls||'').startsWith('turn')))return j({error:'A Metered não retornou servidores TURN.'},502);return j(data)}if(u.pathname.startsWith('/api/servers')){u.searchParams.set('token',token);return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers${u.pathname}${u.search}`,req))}const m=u.pathname.match(/^\/signal\/([\w-]+)$/);if(m)return env.SERVERS.get(env.SERVERS.idFromName('global')).fetch(new Request(`https://servers/ws/${m[1]}?token=${encodeURIComponent(token)}`,req));const asset=await env.ASSETS.fetch(req);if(req.method==='GET'&&(u.pathname==='/'||/\.(?:html|js|css)$/.test(u.pathname))){const headers=new Headers(asset.headers);headers.set('cache-control','no-store, max-age=0');return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers})}return asset}};

// Mantida para compatibilidade com implantações antigas que ainda possuem esse Durable Object.
export class Room{constructor(state){this.state=state}fetch(){return j({error:'Esta sala antiga não é mais utilizada.'},410)}}

export class Users{constructor(c){this.c=c;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,avatar_color TEXT,password_hash TEXT,created_at INTEGER,avatar TEXT DEFAULT "",bio TEXT DEFAULT "")');addColumn(c.storage.sql,'users','avatar TEXT DEFAULT ""');addColumn(c.storage.sql,'users','bio TEXT DEFAULT ""');addColumn(c.storage.sql,'users','banner TEXT DEFAULT ""');addColumn(c.storage.sql,'users','custom_status TEXT DEFAULT ""');addColumn(c.storage.sql,'users','pronouns TEXT DEFAULT ""');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER)')}async fetch(r){const u=new URL(r.url),token=r.headers.get('Authorization')?.replace('Bearer ','')||u.searchParams.get('token')||'';if(r.method==='POST'&&u.pathname==='/api/auth/register'){const x=await r.json(),email=String(x.email||'').trim().toLowerCase(),name=String(x.name||'').trim().slice(0,24),pass=String(x.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||pass.length<8)return j({error:'Informe nome, e-mail válido e senha com 8 caracteres.'},400);if(one(this.c.storage.sql.exec('SELECT id FROM users WHERE email=?',email)))return j({error:'Este e-mail já possui uma conta.'},409);const salt=crypto.getRandomValues(new Uint8Array(16)),id=crypto.randomUUID(),color=['#5865f2','#eb459e','#23a559','#f0b232'][Math.floor(Math.random()*4)];this.c.storage.sql.exec('INSERT INTO users(id,email,display_name,avatar_color,password_hash,created_at,avatar,bio) VALUES(?,?,?,?,?,?,"","")',id,email,name,color,`${b64(salt)}.${b64(await hash(pass,salt))}`,Date.now());return this.session({id,email,name,color})}if(r.method==='POST'&&u.pathname==='/api/auth/login'){const x=await r.json(),z=one(this.c.storage.sql.exec('SELECT * FROM users WHERE email=?',String(x.email||'').trim().toLowerCase()));if(!z)return j({error:'E-mail ou senha incorretos.'},401);const[a,h]=z.password_hash.split('.').map(unb64),d=await hash(String(x.password||''),a);if(d.some((v,i)=>v!==h[i]))return j({error:'E-mail ou senha incorretos.'},401);return this.session(z)}if(r.method==='POST'&&u.pathname==='/api/auth/logout'){if(token)this.c.storage.sql.exec('DELETE FROM sessions WHERE token=?',token);return j({ok:true})}if(u.pathname==='/api/profile'){const profile=one(this.c.storage.sql.exec('SELECT users.id,users.display_name AS name,users.avatar_color AS color,COALESCE(users.avatar,"") AS avatar,COALESCE(users.bio,"") AS bio,COALESCE(users.banner,"") AS banner,COALESCE(users.custom_status,"") AS custom_status,COALESCE(users.pronouns,"") AS pronouns FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()));if(!profile)return j({error:'Não autenticado'},401);if(r.method==='GET')return j({profile});if(r.method==='PATCH'){const x=await r.json(),name=String(x.name||profile.name).trim().slice(0,24),color=/^#[0-9a-f]{6}$/i.test(x.color)?x.color:profile.color,bio=String(x.bio||'').trim().slice(0,190),custom_status=String(x.custom_status||'').trim().slice(0,60),pronouns=String(x.pronouns||'').trim().slice(0,40),avatar=x.avatar===''?'':safeAvatar(x.avatar||profile.avatar),banner=x.banner===''?'':safeBanner(x.banner||profile.banner);if(name.length<2)return j({error:'O nome precisa ter pelo menos 2 caracteres.'},400);if(x.avatar&&!avatar)return j({error:'A imagem do perfil é inválida ou muito grande.'},400);if(x.banner&&!banner)return j({error:'O banner é inválido ou muito grande.'},400);this.c.storage.sql.exec('UPDATE users SET display_name=?,avatar_color=?,avatar=?,bio=?,banner=?,custom_status=?,pronouns=? WHERE id=?',name,color,avatar,bio,banner,custom_status,pronouns,profile.id);return j({profile:{...profile,name,color,avatar,bio,banner,custom_status,pronouns}})}return j({error:'Método inválido'},405)}if(u.pathname==='/session'){const z=one(this.c.storage.sql.exec('SELECT users.id,users.email,users.display_name AS name,users.avatar_color AS color FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',u.searchParams.get('token'),Date.now()));return z?j({user:z}):j({error:'Sessão expirada'},401)}return j({error:'Rota inexistente'},404)}session(u){const t=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');this.c.storage.sql.exec('INSERT INTO sessions VALUES(?,?,?)',t,u.id,Date.now()+2592000000);return j({token:t,user:{id:u.id,email:u.email,name:u.name||u.display_name,color:u.color||u.avatar_color,avatar:u.avatar||'',bio:u.bio||'',banner:u.banner||'',custom_status:u.custom_status||'',pronouns:u.pronouns||''}})}}

const CARD_THEMES=new Set(['midnight','aurora','neon','sunset','ocean']),CARD_EFFECTS=new Set(['none','glow','crystal','stars']);
const baseUserFetch=Users.prototype.fetch;
Users.prototype.fetch=async function(request){const url=new URL(request.url);if(url.pathname!=='/api/profile/card')return baseUserFetch.call(this,request);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS profile_cards(user_id TEXT PRIMARY KEY,theme TEXT,effect TEXT,badge TEXT)');const token=request.headers.get('Authorization')?.replace('Bearer ','')||url.searchParams.get('token')||'',user=one(this.c.storage.sql.exec('SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()));if(!user)return j({error:'Não autenticado'},401);const saved=one(this.c.storage.sql.exec('SELECT theme,effect,badge FROM profile_cards WHERE user_id=?',user.id))||{theme:'midnight',effect:'none',badge:''};if(request.method==='GET')return j({card:saved});if(request.method!=='PATCH')return j({error:'Método inválido'},405);const body=await request.json(),theme=CARD_THEMES.has(body.theme)?body.theme:'midnight',effect=CARD_EFFECTS.has(body.effect)?body.effect:'none',badge=String(body.badge||'').trim().slice(0,24);this.c.storage.sql.exec('INSERT OR REPLACE INTO profile_cards VALUES(?,?,?,?)',user.id,theme,effect,badge);return j({card:{theme,effect,badge}})};

// Conta autenticada: troca de senha exige a credencial atual e encerra as outras sessões.
const profileCardFetch=Users.prototype.fetch;
Users.prototype.fetch=async function(request){
  const url=new URL(request.url);
  if(url.pathname!=='/api/account/password')return profileCardFetch.call(this,request);
  if(request.method!=='PATCH')return j({error:'Método inválido'},405);
  const token=request.headers.get('Authorization')?.replace('Bearer ','')||url.searchParams.get('token')||'';
  const user=one(this.c.storage.sql.exec('SELECT users.id,users.password_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()));
  if(!user)return j({error:'Não autenticado'},401);
  const body=await request.json().catch(()=>({})),current=String(body.current_password||''),next=String(body.new_password||'');
  if(next.length<8)return j({error:'A nova senha precisa ter pelo menos 8 caracteres.'},400);
  if(current===next)return j({error:'Escolha uma senha diferente da atual.'},400);
  const [savedSalt,savedHash]=String(user.password_hash||'').split('.').map(unb64),calculated=await hash(current,savedSalt);
  if(calculated.length!==savedHash.length||calculated.some((value,index)=>value!==savedHash[index]))return j({error:'A senha atual está incorreta.'},401);
  const salt=crypto.getRandomValues(new Uint8Array(16)),passwordHash=`${b64(salt)}.${b64(await hash(next,salt))}`;
  this.c.storage.sql.exec('UPDATE users SET password_hash=? WHERE id=?',passwordHash,user.id);
  this.c.storage.sql.exec('DELETE FROM sessions WHERE user_id=? AND token<>?',user.id,token);
  return j({ok:true});
};

export class Servers{constructor(c,env){this.c=c;this.env=env;c.storage.sql.exec('CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY,name TEXT,icon TEXT,owner TEXT,invite TEXT UNIQUE,created INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS members(server_id TEXT,user_id TEXT,role TEXT,PRIMARY KEY(server_id,user_id))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS channels(server_id TEXT,name TEXT,PRIMARY KEY(server_id,name))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,server_id TEXT,channel TEXT,author TEXT,author_id TEXT,text TEXT,created INTEGER,edited INTEGER)');addColumn(c.storage.sql,'messages','reply_to TEXT DEFAULT ""');addColumn(c.storage.sql,'messages','updated INTEGER DEFAULT 0');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS reactions(message_id TEXT,emoji TEXT,user_id TEXT,PRIMARY KEY(message_id,emoji,user_id))');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS message_deletions(id TEXT PRIMARY KEY,server_id TEXT,deleted INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS message_attachments(id TEXT PRIMARY KEY,message_id TEXT UNIQUE,name TEXT,type TEXT,size INTEGER,data TEXT)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS message_pins(server_id TEXT,message_id TEXT PRIMARY KEY,pinned_by TEXT,pinned_at INTEGER)');c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,avatar TEXT DEFAULT "",bio TEXT DEFAULT "",PRIMARY KEY(server_id,user_id))');addColumn(c.storage.sql,'member_profiles','avatar TEXT DEFAULT ""');addColumn(c.storage.sql,'member_profiles','bio TEXT DEFAULT ""');addColumn(c.storage.sql,'member_profiles','banner TEXT DEFAULT ""');addColumn(c.storage.sql,'member_profiles','custom_status TEXT DEFAULT ""');addColumn(c.storage.sql,'member_profiles','pronouns TEXT DEFAULT ""');addColumn(c.storage.sql,'member_profiles','card_theme TEXT DEFAULT "midnight"');addColumn(c.storage.sql,'member_profiles','card_effect TEXT DEFAULT "none"');addColumn(c.storage.sql,'member_profiles','profile_badge TEXT DEFAULT ""');}
  user(req){return identity(this.env,req.headers.get('x-vix-token')||new URL(req.url).searchParams.get('token'))} member(s,u){return one(this.c.storage.sql.exec('SELECT role FROM members WHERE server_id=? AND user_id=?',s,u.id))?.role} admin(s,u){return ['Dono','Admin'].includes(this.member(s,u))}
  async fetch(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);if(u.pathname==='/api/servers'&&req.method==='GET')return j({servers:[...this.c.storage.sql.exec('SELECT servers.* ,members.role FROM servers JOIN members ON servers.id=members.server_id WHERE members.user_id=? ORDER BY created',user.id)]});if(u.pathname==='/api/servers'&&req.method==='POST'){const x=await req.json(),name=String(x.name||'').trim().slice(0,32);if(name.length<2)return j({error:'Nome inválido'},400);const id=crypto.randomUUID(),invite=crypto.randomUUID().slice(0,8);this.c.storage.sql.exec('INSERT INTO servers VALUES(?,?,?,?,?,?)',id,name,name.slice(0,1).toUpperCase(),user.id,invite,Date.now());this.c.storage.sql.exec('INSERT INTO members VALUES(?,?,?)',id,user.id,'Dono');for(const n of ['geral','boas-vindas'])this.c.storage.sql.exec('INSERT INTO channels VALUES(?,?)',id,n);return j({id,name,invite})}const join=u.pathname.match(/^\/api\/servers\/join\/([\w-]+)$/);if(join&&req.method==='POST'){const s=one(this.c.storage.sql.exec('SELECT id FROM servers WHERE invite=?',join[1]));if(!s)return j({error:'Convite inválido'},404);this.c.storage.sql.exec('INSERT OR IGNORE INTO members VALUES(?,?,?)',s.id,user.id,'Membro');return j({id:s.id})}const info=u.pathname.match(/^\/api\/servers\/([\w-]+)$/);if(info&&req.method==='GET'){if(!this.member(info[1],user))return j({error:'Sem acesso'},403);return j({channels:[...this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=?',info[1])],messages:[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? ORDER BY created DESC LIMIT 200',info[1])].reverse()})}const ws=u.pathname.match(/^\/ws\/([\w-]+)$/);if(ws)return this.websocket(req,ws[1],user);return j({error:'Rota inexistente'},404)}
  websocket(req,serverId,user){if(!this.member(serverId,user))return new Response('Sem acesso',{status:403});const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();server.addEventListener('message',e=>this.message(serverId,user,server,e.data));return new Response(null,{status:101,webSocket:client})}message(s,u,peer,raw){let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='chat'){const text=String(m.text||'').trim().slice(0,1000),channel=String(m.channel||'').slice(0,32);if(!text)return;const id=crypto.randomUUID(),created=Date.now();this.c.storage.sql.exec('INSERT INTO messages(id,server_id,channel,author,author_id,text,created,edited,reply_to,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',id,s,channel,u.name,u.id,text,created,0,'',created);peer.send(JSON.stringify({type:'chat',id,channel,name:u.name,text,created}));return}}}

const PERMISSION_DEFINITIONS=[
  ['VIEW_CHANNELS',1,'Ver canais'],['SEND_MESSAGES',2,'Enviar mensagens'],['CONNECT_VOICE',4,'Conectar à voz'],
  ['MANAGE_SERVER',8,'Gerenciar servidor'],['MANAGE_CHANNELS',16,'Gerenciar canais'],['MANAGE_ROLES',32,'Gerenciar cargos'],
  ['KICK_MEMBERS',64,'Expulsar membros'],['BAN_MEMBERS',128,'Banir membros'],['CREATE_INVITES',256,'Criar convites'],
  ['MANAGE_MESSAGES',512,'Gerenciar mensagens'],['ADMINISTRATOR',1024,'Administrador'],
  ['MODERATE_MEMBERS',2048,'Aplicar timeout e silenciamento'],['APPROVE_MEMBERS',4096,'Aprovar novos membros'],
  ['MANAGE_CHANNEL_PERMISSIONS',8192,'Definir permissões por canal'],['STREAM_VIDEO',16384,'Transmitir tela e vídeo']
];
const PERMISSIONS=Object.fromEntries(PERMISSION_DEFINITIONS.map(([key,value])=>[key,value])),ALL_PERMISSIONS=PERMISSION_DEFINITIONS.reduce((mask,[,value])=>mask|value,0);
const permissionMask=values=>Array.isArray(values)?values.reduce((mask,key)=>mask|(PERMISSIONS[key]||0),0):Math.max(0,Number(values)||0)&ALL_PERMISSIONS;
Servers.prototype.ensureRoleSystem=function(serverId){
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_roles(id TEXT PRIMARY KEY,server_id TEXT,name TEXT,color TEXT,position INTEGER,permissions INTEGER,builtin INTEGER,UNIQUE(server_id,name))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_roles(server_id TEXT,user_id TEXT,role_id TEXT,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_invites(code TEXT PRIMARY KEY,server_id TEXT,created_by TEXT,max_uses INTEGER,uses INTEGER,expires INTEGER,revoked INTEGER,created INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_bans(server_id TEXT,user_id TEXT,name TEXT,reason TEXT,banned_by TEXT,created INTEGER,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,server_id TEXT,actor_id TEXT,actor_name TEXT,action TEXT,target_id TEXT,target_name TEXT,detail TEXT,created INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,avatar TEXT DEFAULT "",bio TEXT DEFAULT "",PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence(server_id TEXT,user_id TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_presence(server_id TEXT,channel TEXT,user_id TEXT,name TEXT,color TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  const defaults=[['owner','Criador','#f4c45c',0,ALL_PERMISSIONS],['admin','Administrador','#a9a7ff',10,ALL_PERMISSIONS],['member','Membro','#747d90',100,PERMISSIONS.VIEW_CHANNELS|PERMISSIONS.SEND_MESSAGES|PERMISSIONS.CONNECT_VOICE|PERMISSIONS.CREATE_INVITES|PERMISSIONS.STREAM_VIDEO]];
  for(const [suffix,name,color,position,permissions] of defaults)this.c.storage.sql.exec('INSERT OR IGNORE INTO server_roles VALUES(?,?,?,?,?,?,1)',`${serverId}-${suffix}`,serverId,name,color,position,permissions);
  this.c.storage.sql.exec('UPDATE server_roles SET permissions=permissions|? WHERE id=? AND permissions=?',PERMISSIONS.STREAM_VIDEO,`${serverId}-member`,PERMISSIONS.VIEW_CHANNELS|PERMISSIONS.SEND_MESSAGES|PERMISSIONS.CONNECT_VOICE|PERMISSIONS.CREATE_INVITES);
  this.c.storage.sql.exec('UPDATE server_roles SET name=?,position=0,permissions=? WHERE id=?','Criador',ALL_PERMISSIONS,`${serverId}-owner`);
  this.c.storage.sql.exec('UPDATE server_roles SET permissions=? WHERE id=?',ALL_PERMISSIONS,`${serverId}-admin`);
  for(const member of this.c.storage.sql.exec('SELECT user_id,role FROM members WHERE server_id=?',serverId)){const suffix=member.role==='Dono'?'owner':member.role==='Admin'?'admin':'member';this.c.storage.sql.exec('INSERT OR IGNORE INTO member_roles VALUES(?,?,?)',serverId,member.user_id,`${serverId}-${suffix}`)}
};
Servers.prototype.roleFor=function(serverId,userId){this.ensureRoleSystem(serverId);return one(this.c.storage.sql.exec('SELECT server_roles.* FROM member_roles JOIN server_roles ON server_roles.id=member_roles.role_id WHERE member_roles.server_id=? AND member_roles.user_id=?',serverId,userId))};
Servers.prototype.permissionsFor=function(serverId,userId){const server=one(this.c.storage.sql.exec('SELECT owner FROM servers WHERE id=?',serverId));if(server?.owner===userId)return ALL_PERMISSIONS;const role=this.roleFor(serverId,userId);return Number(role?.permissions||0)};
Servers.prototype.can=function(serverId,user,permission){const permissions=this.permissionsFor(serverId,user.id);return Boolean((permissions&PERMISSIONS.ADMINISTRATOR)||(permissions&PERMISSIONS[permission]))};
Servers.prototype.audit=function(serverId,user,action,targetId='',targetName='',detail=''){this.c.storage.sql.exec('INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),serverId,user.id,user.name,action,String(targetId||''),String(targetName||'').slice(0,64),String(detail||'').slice(0,240),Date.now())};
Servers.prototype.removeMember=function(serverId,userId){this.c.storage.sql.exec('DELETE FROM members WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_roles WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_profiles WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM member_presence WHERE server_id=? AND user_id=?',serverId,userId);this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,userId);for(const peer of [...(this.voiceSockets?.get(serverId)||[])])if(peer.user.id===userId)peer.socket.close(4003,'Removido do servidor');const room=this.voicePollRooms?.get(serverId);for(const [session,peer] of [...(room?.entries()||[])])if(peer.user.id===userId){room.delete(session);for(const other of room.values())if(other.joined&&other.channel===peer.channel)other.events.push({type:'voice-leave',from:{id:peer.user.id,name:peer.user.name,color:peer.user.color}})}if(room&&!room.size)this.voicePollRooms.delete(serverId)};

const serversFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);const channel=u.pathname.match(/^\/api\/servers\/([\w-]+)\/channels$/),message=u.pathname.match(/^\/api\/servers\/([\w-]+)\/messages$/);if(channel&&req.method==='POST'){if(!this.can(channel[1],user,'MANAGE_CHANNELS'))return j({error:'Sem permissão para gerenciar canais.'},403);const x=await req.json(),name=String(x.name||'').toLowerCase().replace(/\s+/g,'-').slice(0,32);if(!/^[a-z0-9_-]{1,32}$/.test(name))return j({error:'Canal inválido.'},400);this.c.storage.sql.exec('INSERT OR IGNORE INTO channels VALUES(?,?)',channel[1],name);this.audit(channel[1],user,'CHANNEL_CREATE',name,name,'Canal de texto criado');return j({name})}if(message&&req.method==='POST'){if(!this.can(message[1],user,'SEND_MESSAGES'))return j({error:'Você não tem permissão para enviar mensagens.'},403);const x=await req.json(),text=String(x.text||'').trim().slice(0,1000),name=String(x.channel||'').slice(0,32);if(!text||!name)return j({error:'Mensagem inválida.'},400);const item={id:crypto.randomUUID(),server_id:message[1],channel:name,author:user.name,author_id:user.id,text,created:Date.now(),edited:0,reply_to:'',updated:Date.now()};this.c.storage.sql.exec('INSERT INTO messages(id,server_id,channel,author,author_id,text,created,edited,reply_to,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',item.id,item.server_id,item.channel,item.author,item.author_id,item.text,item.created,item.edited,item.reply_to,item.updated);return j({message:item})}return serversFetch.call(this,req)};

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
Servers.prototype.fetch=async function(req){const u=new URL(req.url),user=await this.user(req);if(!user)return j({error:'Não autenticado'},401);this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,avatar TEXT DEFAULT "",bio TEXT DEFAULT "",PRIMARY KEY(server_id,user_id))');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence(server_id TEXT,user_id TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');const match=u.pathname.match(/^\/api\/servers\/([\w-]+)\/members$/);if(match){const serverId=match[1];if(!this.member(serverId,user))return j({error:'Sem acesso'},403);this.ensureRoleSystem(serverId);if(req.method==='POST'){const body=await req.json(),now=Date.now(),name=String(body.name||user.name).slice(0,24),color=/^#[0-9a-f]{6}$/i.test(body.color)?body.color:user.color||'#5865f2';if(body.profile){const avatar=body.avatar===''?'':safeAvatar(body.avatar),banner=body.banner===''?'':safeBanner(body.banner),bio=String(body.bio||'').trim().slice(0,190),custom_status=String(body.custom_status||'').trim().slice(0,60),pronouns=String(body.pronouns||'').trim().slice(0,40),card_theme=CARD_THEMES.has(body.card_theme)?body.card_theme:'midnight',card_effect=CARD_EFFECTS.has(body.card_effect)?body.card_effect:'none',profile_badge=String(body.profile_badge||'').trim().slice(0,24);if(body.avatar&&!avatar)return j({error:'Imagem de perfil inválida.'},400);if(body.banner&&!banner)return j({error:'Banner de perfil inválido.'},400);this.c.storage.sql.exec('INSERT OR REPLACE INTO member_profiles(server_id,user_id,name,color,avatar,bio,banner,custom_status,pronouns,card_theme,card_effect,profile_badge) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',serverId,user.id,name,color,avatar,bio,banner,custom_status,pronouns,card_theme,card_effect,profile_badge)}else this.c.storage.sql.exec('INSERT OR IGNORE INTO member_profiles(server_id,user_id,name,color,avatar,bio,banner,custom_status,pronouns,card_theme,card_effect,profile_badge) VALUES(?,?,?, ?,"","","","","","midnight","none","")',serverId,user.id,name,color);this.c.storage.sql.exec('INSERT OR REPLACE INTO member_presence(server_id,user_id,updated) VALUES(?,?,?)',serverId,user.id,now);return j({ok:true,updated:now})}if(req.method==='GET'){const activeSince=Date.now()-65000;return j({members:[...this.c.storage.sql.exec('SELECT members.user_id,COALESCE(server_roles.name,members.role) AS role,server_roles.id AS role_id,server_roles.color AS role_color,COALESCE(server_roles.position,100) AS role_position,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(member_profiles.color,"#5865f2") AS color,COALESCE(member_profiles.avatar,"") AS avatar,COALESCE(member_profiles.bio,"") AS bio,COALESCE(member_profiles.banner,"") AS banner,COALESCE(member_profiles.custom_status,"") AS custom_status,COALESCE(member_profiles.pronouns,"") AS pronouns,COALESCE(member_profiles.card_theme,"midnight") AS card_theme,COALESCE(member_profiles.card_effect,"none") AS card_effect,COALESCE(member_profiles.profile_badge,"") AS profile_badge,COALESCE(member_presence.updated,0) AS last_seen,CASE WHEN COALESCE(member_presence.updated,0)>=? THEN 1 ELSE 0 END AS online FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id LEFT JOIN member_presence ON members.server_id=member_presence.server_id AND members.user_id=member_presence.user_id LEFT JOIN member_roles ON members.server_id=member_roles.server_id AND members.user_id=member_roles.user_id LEFT JOIN server_roles ON server_roles.id=member_roles.role_id WHERE members.server_id=? ORDER BY COALESCE(server_roles.position,100),name',activeSince,serverId)]})}}return memberFetch.call(this,req)};

// Administração persistente do servidor, funções e canais de voz.
const managedServerFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(req){
  const u=new URL(req.url);
  const hasManagedBody=(req.method==='PATCH'&&(/^\/api\/servers\/[\w-]+$/.test(u.pathname)||/^\/api\/servers\/[\w-]+\/(?:voice-channels|members)\/[\w-]+$/.test(u.pathname)))||(req.method==='POST'&&/^\/api\/servers\/[\w-]+\/voice-channels$/.test(u.pathname));
  const managedBody=hasManagedBody?await req.json().catch(()=>({})):null;
  const user=await this.user(req);
  if(!user)return j({error:'Não autenticado'},401);
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS voice_channels(id TEXT PRIMARY KEY,server_id TEXT,name TEXT,created INTEGER,UNIQUE(server_id,name))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_profiles(server_id TEXT,user_id TEXT,name TEXT,color TEXT,avatar TEXT DEFAULT "",bio TEXT DEFAULT "",PRIMARY KEY(server_id,user_id))');
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
  for(const peer of this.voiceSockets?.get(serverId)||[])if(peer.joined&&peer.socket.readyState===1)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,avatar:peer.user.avatar||'',bio:peer.user.bio||'',channel:peer.channel||'Geral'});
  const room=this.voicePollRooms?.get(serverId);
  for(const peer of room?.values()||[])if(peer.joined&&now-peer.updated<=15000)users.set(peer.user.id,{user_id:peer.user.id,name:peer.user.name,color:peer.user.color,avatar:peer.user.avatar||'',bio:peer.user.bio||'',channel:peer.channel||'Geral'});
  // LiveKit participants do not use the legacy signalling sockets above. Their
  // client refreshes this durable presence while the SFU room is connected.
  // Keeping a short expiry also removes users after crashes or lost networks.
  for(const peer of this.c.storage.sql.exec('SELECT voice_presence.user_id,voice_presence.name,voice_presence.color,voice_presence.channel,COALESCE(member_profiles.avatar,\'\') AS avatar,COALESCE(member_profiles.bio,\'\') AS bio FROM voice_presence LEFT JOIN member_profiles ON member_profiles.server_id=voice_presence.server_id AND member_profiles.user_id=voice_presence.user_id WHERE voice_presence.server_id=? AND voice_presence.updated>=?',serverId,now-30000))users.set(peer.user_id,peer);
  this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND updated<?',serverId,now-30000);
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
  if(u.pathname===`/api/servers/${serverId}`&&req.method==='GET'){if(!can('VIEW_CHANNELS'))return j({error:'Você não tem permissão para ver os canais deste servidor.'},403);const response=await governanceFetch.call(this,req);if(!response.ok)return response;const data=await response.json();data.capabilities={sendMessages:can('SEND_MESSAGES'),connectVoice:can('CONNECT_VOICE'),streamVideo:can('STREAM_VIDEO'),manageChannels:can('MANAGE_CHANNELS'),manageMessages:can('MANAGE_MESSAGES'),createInvites:can('CREATE_INVITES')};return j(data)}
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
      const id=link.user_a===user.id?link.user_b:link.user_a,person=one(this.c.storage.sql.exec('SELECT id,display_name AS name,avatar_color AS color,COALESCE(avatar,"") AS avatar,COALESCE(banner,"") AS banner,COALESCE(custom_status,"") AS custom_status,COALESCE(pronouns,"") AS pronouns,COALESCE(bio,"") AS bio FROM users WHERE id=?',id));if(!person)continue;
      const presence=one(this.c.storage.sql.exec('SELECT updated FROM private_presence WHERE user_id=?',id)),unread=one(this.c.storage.sql.exec('SELECT COUNT(*) AS count FROM direct_messages WHERE sender_id=? AND receiver_id=? AND read_at IS NULL',id,user.id));
      const last=one(this.c.storage.sql.exec('SELECT text,created FROM direct_messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created DESC LIMIT 1',user.id,id,id,user.id));
      friends.push({...person,online:!!presence&&now-presence.updated<65000,unread:Number(unread?.count||0),last_message:last?.text||'',last_message_at:last?.created||0});
    }
    friends.sort((a,b)=>Number(b.online)-Number(a.online)||b.last_message_at-a.last_message_at||a.name.localeCompare(b.name));
    const incoming=[...this.c.storage.sql.exec('SELECT friend_requests.id,friend_requests.created,users.id AS user_id,users.display_name AS name,users.avatar_color AS color,COALESCE(users.avatar,"") AS avatar FROM friend_requests JOIN users ON users.id=friend_requests.sender_id WHERE receiver_id=? AND status=? ORDER BY friend_requests.created DESC',user.id,'pending')];
    const outgoing=[...this.c.storage.sql.exec('SELECT friend_requests.id,friend_requests.created,users.id AS user_id,users.display_name AS name,users.avatar_color AS color,COALESCE(users.avatar,"") AS avatar FROM friend_requests JOIN users ON users.id=friend_requests.receiver_id WHERE sender_id=? AND status=? ORDER BY friend_requests.created DESC',user.id,'pending')];
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

// Chat em tempo real por sincronização incremental. O Durable Object mantém a
// digitação como estado efêmero e o banco continua sendo a fonte das mensagens.
const realtimeChatFetch=Servers.prototype.fetch;
Servers.prototype.chatMessage=function(row,user){
  if(!row)return null;
  const reply=row.reply_to?one(this.c.storage.sql.exec('SELECT id,author,text FROM messages WHERE server_id=? AND id=?',row.server_id,row.reply_to)):null;
  const reactions=[...this.c.storage.sql.exec('SELECT emoji,COUNT(*) AS count,MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS active FROM reactions WHERE message_id=? GROUP BY emoji ORDER BY emoji',user.id,row.id)].map(item=>({...item,count:Number(item.count),active:Boolean(Number(item.active))}));
  const attachment=one(this.c.storage.sql.exec('SELECT id,name,type,size FROM message_attachments WHERE message_id=?',row.id))||null,pinned=Boolean(one(this.c.storage.sql.exec('SELECT message_id FROM message_pins WHERE server_id=? AND message_id=?',row.server_id,row.id)));
  return {...row,reply:row.reply_to?(reply||{id:row.reply_to,deleted:true}):null,reactions,attachment,pinned};
};
Servers.prototype.fetch=async function(request){
  const url=new URL(request.url);
  const messages=url.pathname.match(/^\/api\/servers\/([\w-]+)\/messages$/),typing=url.pathname.match(/^\/api\/servers\/([\w-]+)\/typing$/),message=url.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)$/),reaction=url.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)\/reactions$/),search=url.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/search$/),pin=url.pathname.match(/^\/api\/servers\/([\w-]+)\/messages\/([\w-]+)\/pin$/),pins=url.pathname.match(/^\/api\/servers\/([\w-]+)\/pins$/),attachment=url.pathname.match(/^\/api\/servers\/([\w-]+)\/attachments\/([\w-]+)$/);
  if(!messages&&!typing&&!message&&!reaction&&!search&&!pin&&!pins&&!attachment)return realtimeChatFetch.call(this,request);
  const user=await this.user(request);
  if(!user)return j({error:'Não autenticado'},401);
  const serverId=(messages||typing||message||reaction||search||pin||pins||attachment)[1];
  if(!this.can(serverId,user,'VIEW_CHANNELS'))return j({error:'Sem acesso a este servidor.'},403);
  const now=Date.now(),typingState=this.chatTyping||(this.chatTyping=new Map());
  for(const [key,entry] of typingState)if(now-entry.updated>6500)typingState.delete(key);
  if(typing&&request.method==='POST'){
    if(!this.can(serverId,user,'SEND_MESSAGES'))return j({error:'Sem permissão para enviar mensagens.'},403);
    const body=await request.json().catch(()=>({})),channel=String(body.channel||'').slice(0,32),key=`${serverId}:${user.id}`;
    if(!channel||!one(this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? AND name=?',serverId,channel)))return j({error:'Canal inválido.'},400);
    if(body.typing===false)typingState.delete(key);else typingState.set(key,{serverId,channel,user_id:user.id,name:user.name,updated:now});
    return j({ok:true});
  }
  if(search&&request.method==='GET'){
    const query=String(url.searchParams.get('q')||'').trim().slice(0,80),channel=String(url.searchParams.get('channel')||'').slice(0,32);
    if(query.length<2)return j({messages:[]});
    const rows=channel
      ?[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND channel=? AND text LIKE ? ORDER BY created DESC LIMIT 50',serverId,channel,`%${query}%`)]
      :[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND text LIKE ? ORDER BY created DESC LIMIT 50',serverId,`%${query}%`)];
    return j({messages:rows.map(row=>this.chatMessage(row,user))});
  }
  if(pins&&request.method==='GET'){
    const channel=String(url.searchParams.get('channel')||'').slice(0,32),rows=channel
      ?[...this.c.storage.sql.exec('SELECT messages.* FROM message_pins JOIN messages ON messages.id=message_pins.message_id WHERE message_pins.server_id=? AND messages.channel=? ORDER BY message_pins.pinned_at DESC LIMIT 100',serverId,channel)]
      :[...this.c.storage.sql.exec('SELECT messages.* FROM message_pins JOIN messages ON messages.id=message_pins.message_id WHERE message_pins.server_id=? ORDER BY message_pins.pinned_at DESC LIMIT 100',serverId)];
    return j({messages:rows.map(row=>this.chatMessage(row,user))});
  }
  if(attachment&&request.method==='GET'){
    const file=one(this.c.storage.sql.exec('SELECT message_attachments.* FROM message_attachments JOIN messages ON messages.id=message_attachments.message_id WHERE messages.server_id=? AND message_attachments.id=?',serverId,attachment[2]));
    if(!file)return j({error:'Arquivo não encontrado.'},404);
    const match=/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(file.data||'');
    if(!match)return j({error:'Arquivo inválido.'},500);
    return new Response(unb64(match[2]),{headers:{'content-type':file.type,'content-length':String(file.size),'content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'cache-control':'private, max-age=300'}});
  }
  if(messages&&request.method==='POST'){
    if(!this.can(serverId,user,'SEND_MESSAGES'))return j({error:'Você não tem permissão para enviar mensagens.'},403);
    const body=await request.json().catch(()=>({})),text=String(body.text||'').trim().slice(0,1000),channel=String(body.channel||'').slice(0,32),replyTo=String(body.reply_to||'').slice(0,64),file=body.attachment||null;
    if((!text&&!file)||!channel||!one(this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? AND name=?',serverId,channel)))return j({error:'Mensagem inválida.'},400);
    if(replyTo&&!one(this.c.storage.sql.exec('SELECT id FROM messages WHERE server_id=? AND channel=? AND id=?',serverId,channel,replyTo)))return j({error:'A mensagem respondida não existe mais.'},404);
    let upload=null;
    if(file){const name=String(file.name||'arquivo').replace(/[\r\n]/g,' ').slice(0,120),type=String(file.type||'application/octet-stream').toLowerCase(),data=String(file.data||''),match=/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(data),allowed=new Set(['image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/ogg','audio/wav','video/mp4','video/webm','application/pdf','application/zip','text/plain']);const size=Math.floor((match?.[2].replace(/=+$/,'').length||0)*3/4);if(!match||match[1].toLowerCase()!==type||!allowed.has(type)||size<1||size>4194304)return j({error:'Use um arquivo permitido de até 4 MB.'},413);upload={id:crypto.randomUUID(),name,type,size,data};}
    const item={id:crypto.randomUUID(),server_id:serverId,channel,author:user.name,author_id:user.id,text,created:now,edited:0,reply_to:replyTo,updated:now};
    this.c.storage.sql.exec('INSERT INTO messages(id,server_id,channel,author,author_id,text,created,edited,reply_to,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',item.id,item.server_id,item.channel,item.author,item.author_id,item.text,item.created,item.edited,item.reply_to,item.updated);
    if(upload)this.c.storage.sql.exec('INSERT INTO message_attachments VALUES(?,?,?,?,?,?)',upload.id,item.id,upload.name,upload.type,upload.size,upload.data);
    return j({message:this.chatMessage(item,user)},201);
  }
  if(pin&&(request.method==='POST'||request.method==='DELETE')){
    if(!this.can(serverId,user,'MANAGE_MESSAGES'))return j({error:'Sem permissão para fixar mensagens.'},403);
    const saved=one(this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND id=?',serverId,pin[2]));if(!saved)return j({error:'Mensagem não encontrada.'},404);
    if(request.method==='POST')this.c.storage.sql.exec('INSERT OR REPLACE INTO message_pins VALUES(?,?,?,?)',serverId,saved.id,user.id,now);else this.c.storage.sql.exec('DELETE FROM message_pins WHERE server_id=? AND message_id=?',serverId,saved.id);
    this.c.storage.sql.exec('UPDATE messages SET updated=? WHERE id=?',now,saved.id);
    return j({message:this.chatMessage({...saved,updated:now},user)});
  }
  if(message){
    const saved=one(this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND id=?',serverId,message[2]));
    if(!saved)return j({error:'Mensagem não encontrada.'},404);
    if(request.method==='PATCH'){
      if(saved.author_id!==user.id&&!this.can(serverId,user,'MANAGE_MESSAGES'))return j({error:'Sem permissão para editar esta mensagem.'},403);
      const body=await request.json().catch(()=>({})),text=String(body.text||'').trim().slice(0,1000);
      if(!text)return j({error:'Mensagem inválida.'},400);
      this.c.storage.sql.exec('UPDATE messages SET text=?,edited=?,updated=? WHERE id=?',text,now,now,saved.id);
      return j({message:this.chatMessage({...saved,text,edited:now,updated:now},user)});
    }
    if(request.method==='DELETE'){
      if(saved.author_id!==user.id&&!this.can(serverId,user,'MANAGE_MESSAGES'))return j({error:'Sem permissão para excluir esta mensagem.'},403);
      this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=?',saved.id);
      this.c.storage.sql.exec('DELETE FROM message_attachments WHERE message_id=?',saved.id);
      this.c.storage.sql.exec('DELETE FROM message_pins WHERE message_id=?',saved.id);
      this.c.storage.sql.exec('DELETE FROM messages WHERE id=?',saved.id);
      this.c.storage.sql.exec('INSERT OR REPLACE INTO message_deletions VALUES(?,?,?)',saved.id,serverId,now);
      return j({ok:true,deleted:saved.id});
    }
  }
  if(reaction&&request.method==='POST'){
    if(!this.can(serverId,user,'SEND_MESSAGES'))return j({error:'Sem permissão para reagir.'},403);
    const saved=one(this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND id=?',serverId,reaction[2]));
    if(!saved)return j({error:'Mensagem não encontrada.'},404);
    const body=await request.json().catch(()=>({})),emoji=String(body.emoji||'').trim().slice(0,8);
    if(!emoji)return j({error:'Reação inválida.'},400);
    const exists=one(this.c.storage.sql.exec('SELECT user_id FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',saved.id,emoji,user.id));
    if(exists)this.c.storage.sql.exec('DELETE FROM reactions WHERE message_id=? AND emoji=? AND user_id=?',saved.id,emoji,user.id);else this.c.storage.sql.exec('INSERT INTO reactions VALUES(?,?,?)',saved.id,emoji,user.id);
    this.c.storage.sql.exec('UPDATE messages SET updated=? WHERE id=?',now,saved.id);
    return j({message:this.chatMessage({...saved,updated:now},user)});
  }
  if(messages&&request.method==='GET'){
    const after=Math.max(0,Number(url.searchParams.get('after'))||0);
    const rows=after
      ?[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? AND (created>=? OR edited>=? OR updated>=?) ORDER BY created ASC LIMIT 250',serverId,after,after,after)]
      :[...this.c.storage.sql.exec('SELECT * FROM messages WHERE server_id=? ORDER BY created DESC LIMIT 200',serverId)].reverse();
    const activeTyping=[...typingState.values()].filter(entry=>entry.serverId===serverId&&entry.user_id!==user.id).map(({channel,user_id,name})=>({channel,user_id,name}));
    const deleted=after?[...this.c.storage.sql.exec('SELECT id FROM message_deletions WHERE server_id=? AND deleted>=? LIMIT 250',serverId,after)].map(row=>row.id):[];
    this.c.storage.sql.exec('DELETE FROM message_deletions WHERE deleted<?',now-86400000);
    return j({messages:rows.map(row=>this.chatMessage(row,user)),deleted,typing:activeTyping,cursor:now});
  }
  return realtimeChatFetch.call(this,request);
};

// Tokens curtos para o SFU próprio. A chave nunca é enviada ao cliente.
const sfuFetch=Servers.prototype.fetch;
const sfuBase64Url=value=>b64(value instanceof Uint8Array?value:E.encode(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function signSfuToken(apiKey,apiSecret,claims){
  const header=sfuBase64Url(JSON.stringify({alg:'HS256',typ:'JWT'})),payload=sfuBase64Url(JSON.stringify(claims));
  const key=await crypto.subtle.importKey('raw',E.encode(apiSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,E.encode(`${header}.${payload}`));
  return `${header}.${payload}.${sfuBase64Url(new Uint8Array(signature))}`;
}
Servers.prototype.fetch=async function(request){
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/servers\/([\w-]+)\/sfu-token$/);
  if(!match)return sfuFetch.call(this,request);
  if(request.method!=='POST')return j({error:'Metodo invalido.'},405);
  const user=await this.user(request),serverId=match[1];
  if(!user)return j({error:'Nao autenticado'},401);
  if(!this.member(serverId,user)||!this.can(serverId,user,'CONNECT_VOICE'))return j({error:'Sem permissao para conectar a voz.'},403);
  const body=await request.json().catch(()=>({})),channel=String(body.channel||'').slice(0,64);
  if(!channel||!one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? AND id=?',serverId,channel)))return j({error:'Canal de voz nao encontrado.'},404);
  if(!this.canInChannel(serverId,user,'CONNECT_VOICE','voice',channel))return j({error:'Seu cargo nao pode entrar neste canal de voz.'},403);
  const sanctions=this.activeSanctions(serverId,user.id);
  if(sanctions.some(item=>['block','timeout','mute'].includes(item.type)))return j({error:'Voce nao pode entrar na voz durante esta restricao.'},403);
  const apiKey=String(this.env.LIVEKIT_API_KEY||''),apiSecret=String(this.env.LIVEKIT_API_SECRET||''),endpoint=String(this.env.LIVEKIT_URL||'');
  if(apiKey.length<8||apiSecret.length<32||!/^wss:\/\//i.test(endpoint))return j({error:'Servidor SFU ainda nao configurado.'},503);
  const now=Math.floor(Date.now()/1000),room=`server:${serverId}:voice:${channel}`,canStream=this.canInChannel(serverId,user,'STREAM_VIDEO','voice',channel);
  const canPublishSources=canStream?['microphone','camera','screen_share','screen_share_audio']:['microphone'];
  const token=await signSfuToken(apiKey,apiSecret,{iss:apiKey,sub:user.id,name:user.name,nbf:now-5,exp:now+7200,metadata:JSON.stringify({color:user.color||'#5865f2'}),video:{roomJoin:true,room,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources}});
  return j({url:endpoint,token,room,canStream,participant:{id:user.id,name:user.name,color:user.color||'#5865f2'}});
};

// Presença profissional: status escolhido, ausência automática e modo invisível.
const presenceUsersFetch=Users.prototype.fetch;
const PRESENCE_STATES=new Set(['online','idle','dnd','invisible']);
Users.prototype.fetch=async function(request){
  const url=new URL(request.url);
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS user_presence_preferences(user_id TEXT PRIMARY KEY,status TEXT,updated INTEGER)');
  if(url.pathname==='/api/profile/presence'){
    const token=request.headers.get('Authorization')?.replace('Bearer ','')||url.searchParams.get('token')||'',user=one(this.c.storage.sql.exec('SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()));
    if(!user)return j({error:'Não autenticado'},401);
    const saved=one(this.c.storage.sql.exec('SELECT status,updated FROM user_presence_preferences WHERE user_id=?',user.id))||{status:'online',updated:0};
    if(request.method==='GET')return j({presence:{status:PRESENCE_STATES.has(saved.status)?saved.status:'online',updated:saved.updated||0}});
    if(request.method!=='PATCH')return j({error:'Método inválido'},405);
    const body=await request.json().catch(()=>({})),status=String(body.status||'');
    if(!PRESENCE_STATES.has(status))return j({error:'Status inválido.'},400);
    const updated=Date.now();this.c.storage.sql.exec('INSERT OR REPLACE INTO user_presence_preferences VALUES(?,?,?)',user.id,status,updated);
    return j({presence:{status,updated}});
  }
  const response=await presenceUsersFetch.call(this,request);
  if(url.pathname==='/api/private/home'&&request.method==='GET'&&response.ok){
    const data=await response.json();
    data.friends=(data.friends||[]).map(friend=>{const saved=one(this.c.storage.sql.exec('SELECT status FROM user_presence_preferences WHERE user_id=?',friend.id)),status=PRESENCE_STATES.has(saved?.status)?saved.status:'online',visible=friend.online&&status!=='invisible';return{...friend,online:visible,presence_status:visible?status:'offline'}});
    return j(data);
  }
  return response;
};

const presenceServersFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(request){
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/servers\/([\w-]+)\/members$/);
  if(!match)return presenceServersFetch.call(this,request);
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_presence_status(server_id TEXT,user_id TEXT,status TEXT,updated INTEGER,PRIMARY KEY(server_id,user_id))');
  if(request.method==='POST'){
    const body=await request.clone().json().catch(()=>({})),response=await presenceServersFetch.call(this,request);
    if(response.ok&&PRESENCE_STATES.has(body.presence_status)){const user=await this.user(request);if(user)this.c.storage.sql.exec('INSERT OR REPLACE INTO member_presence_status VALUES(?,?,?,?)',match[1],user.id,body.presence_status,Date.now())}
    return response;
  }
  const response=await presenceServersFetch.call(this,request);
  if(request.method!=='GET'||!response.ok)return response;
  const data=await response.json(),viewer=await this.user(request),now=Date.now();
  data.members=(data.members||[]).map(member=>{const saved=one(this.c.storage.sql.exec('SELECT status FROM member_presence_status WHERE server_id=? AND user_id=?',match[1],member.user_id)),fresh=now-Number(member.last_seen||0)<65000,selected=PRESENCE_STATES.has(saved?.status)?saved.status:'online',status=fresh?selected:'offline',visible=status!=='invisible'||member.user_id===viewer?.id;return{...member,presence_status:visible?status:'offline',online:Number(fresh&&selected!=='invisible')}});
  return j(data);
};

// Segurança de conta: limite de login e gerenciamento de dispositivos conectados.
const secureUsersFetch=Users.prototype.fetch;
function sessionDevice(userAgent=''){
  const agent=String(userAgent);if(/Electron/i.test(agent))return /Windows/i.test(agent)?'Vix Voice para Windows':'Aplicativo Vix Voice';
  const browser=/Edg\//i.test(agent)?'Microsoft Edge':/Firefox\//i.test(agent)?'Firefox':/Chrome\//i.test(agent)?'Google Chrome':/Safari\//i.test(agent)?'Safari':'Navegador';
  const system=/Windows/i.test(agent)?'Windows':/Android/i.test(agent)?'Android':/iPhone|iPad/i.test(agent)?'iPhone/iPad':/Mac OS/i.test(agent)?'macOS':/Linux/i.test(agent)?'Linux':'dispositivo desconhecido';return`${browser} em ${system}`;
}
Users.prototype.ensureAccountSecurity=function(){
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS session_metadata(token TEXT PRIMARY KEY,session_id TEXT UNIQUE,device TEXT,created INTEGER,last_seen INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,attempts INTEGER,window_started INTEGER,blocked_until INTEGER)');
};
Users.prototype.sessionOwner=function(token){return one(this.c.storage.sql.exec('SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?',token,Date.now()))};
Users.prototype.fetch=async function(request){
  const url=new URL(request.url),token=request.headers.get('Authorization')?.replace('Bearer ','')||url.searchParams.get('token')||'';this.ensureAccountSecurity();
  if(url.pathname==='/api/auth/login'&&request.method==='POST'){
    const body=await request.clone().json().catch(()=>({})),email=String(body.email||'').trim().toLowerCase().slice(0,254),ip=String(request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'local').split(',')[0].trim().slice(0,64),key=`${ip}|${email}`,now=Date.now();
    this.c.storage.sql.exec('DELETE FROM login_attempts WHERE window_started<? AND blocked_until<?',now-86400000,now);
    const attempt=one(this.c.storage.sql.exec('SELECT * FROM login_attempts WHERE key=?',key));
    if(Number(attempt?.blocked_until||0)>now){const seconds=Math.max(1,Math.ceil((attempt.blocked_until-now)/1000));return new Response(JSON.stringify({error:`Muitas tentativas. Aguarde ${Math.ceil(seconds/60)} minuto(s).`,retry_after:seconds}),{status:429,headers:{'content-type':'application/json','retry-after':String(seconds),'cache-control':'no-store'}})}
    const response=await secureUsersFetch.call(this,request);
    if(response.status===401){const within=attempt&&now-Number(attempt.window_started||0)<900000,count=within?Number(attempt.attempts||0)+1:1,started=within?attempt.window_started:now,blocked=count>=5?now+900000:0;this.c.storage.sql.exec('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?,?)',key,count,started,blocked)}else if(response.ok)this.c.storage.sql.exec('DELETE FROM login_attempts WHERE key=?',key);
    if(response.ok){const data=await response.clone().json().catch(()=>null);if(data?.token)this.c.storage.sql.exec('INSERT OR REPLACE INTO session_metadata VALUES(?,?,?,?,?)',data.token,crypto.randomUUID(),sessionDevice(request.headers.get('User-Agent')),now,now)}
    return response;
  }
  if(url.pathname==='/api/auth/register'&&request.method==='POST'){
    const response=await secureUsersFetch.call(this,request);if(response.ok){const data=await response.clone().json().catch(()=>null),now=Date.now();if(data?.token)this.c.storage.sql.exec('INSERT OR REPLACE INTO session_metadata VALUES(?,?,?,?,?)',data.token,crypto.randomUUID(),sessionDevice(request.headers.get('User-Agent')),now,now)}return response;
  }
  const sessionRoute=url.pathname==='/session';
  if(sessionRoute){const response=await secureUsersFetch.call(this,request);if(response.ok&&token){const saved=one(this.c.storage.sql.exec('SELECT token FROM session_metadata WHERE token=?',token)),now=Date.now();if(saved)this.c.storage.sql.exec('UPDATE session_metadata SET last_seen=? WHERE token=?',now,token);else this.c.storage.sql.exec('INSERT OR REPLACE INTO session_metadata VALUES(?,?,?,?,?)',token,crypto.randomUUID(),'Sessão anterior',now,now)}return response}
  const sessionsRoute=url.pathname==='/api/account/sessions',sessionItem=url.pathname.match(/^\/api\/account\/sessions\/([\w-]+)$/);
  if(sessionsRoute||sessionItem){const user=this.sessionOwner(token);if(!user)return j({error:'Não autenticado'},401);const now=Date.now();this.c.storage.sql.exec('DELETE FROM session_metadata WHERE token NOT IN (SELECT token FROM sessions)');const active=[...this.c.storage.sql.exec('SELECT token,expires_at FROM sessions WHERE user_id=? AND expires_at>?',user.id,now)];for(const item of active)if(!one(this.c.storage.sql.exec('SELECT token FROM session_metadata WHERE token=?',item.token))){const created=Math.max(0,Number(item.expires_at)-2592000000);this.c.storage.sql.exec('INSERT OR REPLACE INTO session_metadata VALUES(?,?,?,?,?)',item.token,crypto.randomUUID(),'Sessão anterior',created,created)}
    if(sessionsRoute&&request.method==='GET'){const rows=[...this.c.storage.sql.exec('SELECT session_metadata.session_id,session_metadata.device,session_metadata.created,session_metadata.last_seen,sessions.expires_at,CASE WHEN sessions.token=? THEN 1 ELSE 0 END AS current FROM sessions JOIN session_metadata ON session_metadata.token=sessions.token WHERE sessions.user_id=? AND sessions.expires_at>? ORDER BY current DESC,session_metadata.last_seen DESC',token,user.id,now)];return j({sessions:rows})}
    if(sessionsRoute&&request.method==='DELETE'){this.c.storage.sql.exec('DELETE FROM session_metadata WHERE token IN (SELECT token FROM sessions WHERE user_id=? AND token<>?)',user.id,token);this.c.storage.sql.exec('DELETE FROM sessions WHERE user_id=? AND token<>?',user.id,token);return j({ok:true})}
    if(sessionItem&&request.method==='DELETE'){const target=one(this.c.storage.sql.exec('SELECT sessions.token FROM sessions JOIN session_metadata ON session_metadata.token=sessions.token WHERE sessions.user_id=? AND session_metadata.session_id=?',user.id,sessionItem[1]));if(!target)return j({error:'Sessão não encontrada.'},404);if(target.token===token)return j({error:'Use “Sair da conta” para encerrar este dispositivo.'},409);this.c.storage.sql.exec('DELETE FROM session_metadata WHERE token=?',target.token);this.c.storage.sql.exec('DELETE FROM sessions WHERE token=?',target.token);return j({ok:true})}
    return j({error:'Método inválido'},405);
  }
  return secureUsersFetch.call(this,request);
};

// Métricas agregadas para o monitor local. Não expõe usuários, canais ou conteúdo.
const infrastructureServersFetch=Servers.prototype.fetch;
Servers.prototype.fetch=async function(request){
  const url=new URL(request.url);
  if(url.pathname!=='/api/servers/_infra/metrics'||request.method!=='GET')return infrastructureServersFetch.call(this,request);
  const connections=new Set(),rooms=new Set(),now=Date.now();
  for(const [serverId,peers] of this.voiceSockets||[]){
    for(const peer of peers||[])if(peer.joined&&peer.socket?.readyState===1){connections.add(`${serverId}:${peer.user.id}`);rooms.add(`${serverId}:${peer.channel||'Geral'}`)}
  }
  for(const [serverId,peers] of this.voicePollRooms||[]){
    for(const peer of peers?.values?.()||[])if(peer.joined&&now-Number(peer.updated||0)<=15000){connections.add(`${serverId}:${peer.user.id}`);rooms.add(`${serverId}:${peer.channel||'Geral'}`)}
  }
  return new Response(JSON.stringify({voiceConnections:connections.size,voiceRooms:rooms.size}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
};

// Administração avançada: acessos por canal, fila de entrada, sanções e proteção contra spam.
const advancedAdministrationFetch=Servers.prototype.fetch;
const CHANNEL_PERMISSION_KEYS={text:['VIEW_CHANNELS','SEND_MESSAGES'],voice:['VIEW_CHANNELS','CONNECT_VOICE','STREAM_VIDEO']};
Servers.prototype.ensureAdvancedAdministration=function(serverId){
  this.ensureRoleSystem(serverId);
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS channel_permissions(server_id TEXT,channel_type TEXT,channel_id TEXT,role_id TEXT,allow_mask INTEGER,deny_mask INTEGER,PRIMARY KEY(server_id,channel_type,channel_id,role_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS member_sanctions(server_id TEXT,user_id TEXT,type TEXT,until_at INTEGER,reason TEXT,created_by TEXT,created INTEGER,PRIMARY KEY(server_id,user_id,type))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS membership_requests(id TEXT PRIMARY KEY,server_id TEXT,user_id TEXT,name TEXT,color TEXT,invite_code TEXT,created INTEGER,UNIQUE(server_id,user_id))');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_security_settings(server_id TEXT PRIMARY KEY,require_approval INTEGER,anti_spam INTEGER,updated INTEGER)');
  this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS message_rate_limits(server_id TEXT,user_id TEXT,window_started INTEGER,message_count INTEGER,last_text TEXT,duplicate_count INTEGER,blocked_until INTEGER,PRIMARY KEY(server_id,user_id))');
  this.c.storage.sql.exec('INSERT OR IGNORE INTO server_security_settings VALUES(?,0,1,?)',serverId,Date.now());
};
Servers.prototype.channelPermissionMask=function(values,channelType){
  const allowed=new Set(CHANNEL_PERMISSION_KEYS[channelType]||[]);return Array.isArray(values)?values.reduce((mask,key)=>mask|(allowed.has(key)?PERMISSIONS[key]:0),0):0;
};
Servers.prototype.canInChannel=function(serverId,user,permission,channelType,channelId){
  const server=one(this.c.storage.sql.exec('SELECT owner FROM servers WHERE id=?',serverId));if(server?.owner===user.id)return true;
  const role=this.roleFor(serverId,user.id),roleMask=Number(role?.permissions||0);if(roleMask&PERMISSIONS.ADMINISTRATOR)return true;
  let result=Boolean(roleMask&PERMISSIONS[permission]);
  const override=one(this.c.storage.sql.exec('SELECT allow_mask,deny_mask FROM channel_permissions WHERE server_id=? AND channel_type=? AND channel_id=? AND role_id=?',serverId,channelType,String(channelId),role?.id||'')),bit=PERMISSIONS[permission]||0;
  if(Number(override?.deny_mask||0)&bit)return false;if(Number(override?.allow_mask||0)&bit)return true;return result;
};
Servers.prototype.activeSanctions=function(serverId,userId){
  const now=Date.now();this.c.storage.sql.exec('DELETE FROM member_sanctions WHERE server_id=? AND until_at>0 AND until_at<=?',serverId,now);return[...this.c.storage.sql.exec('SELECT type,until_at,reason FROM member_sanctions WHERE server_id=? AND user_id=? ORDER BY created DESC',serverId,userId)];
};
Servers.prototype.disconnectVoiceMember=function(serverId,userId,reason='Moderação aplicada'){
  for(const peer of [...(this.voiceSockets?.get(serverId)||[])])if(peer.user.id===userId)peer.socket.close(4003,reason);
  const room=this.voicePollRooms?.get(serverId);for(const [session,peer] of [...(room?.entries()||[])])if(peer.user.id===userId){room.delete(session);for(const other of room.values())if(other.joined&&other.channel===peer.channel)other.events.push({type:'voice-leave',from:{id:peer.user.id,name:peer.user.name,color:peer.user.color}})}if(room&&!room.size)this.voicePollRooms.delete(serverId);
  this.c.storage.sql.exec('DELETE FROM voice_presence WHERE server_id=? AND user_id=?',serverId,userId);
};
Servers.prototype.messageSafety=function(serverId,user,text){
  const settings=one(this.c.storage.sql.exec('SELECT anti_spam FROM server_security_settings WHERE server_id=?',serverId));if(!Number(settings?.anti_spam))return null;
  const clean=String(text||'').trim(),normalized=clean.toLowerCase().replace(/\s+/g,' '),now=Date.now();
  if(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/i.test(clean)||/\b(?:javascript|data):/i.test(clean))return 'A mensagem contém um link ou caractere potencialmente malicioso.';
  const links=clean.match(/https?:\/\/[^\s]+/gi)||[],blockedHosts=new Set(['bit.ly','tinyurl.com','t.co','is.gd','cutt.ly','rb.gy']);
  if(links.length>4)return 'A mensagem contém links demais.';
  for(const link of links)try{if(blockedHosts.has(new URL(link).hostname.toLowerCase()))return 'Encurtadores de link não são permitidos neste servidor.'}catch{return 'O endereço enviado é inválido.'}
  const saved=one(this.c.storage.sql.exec('SELECT * FROM message_rate_limits WHERE server_id=? AND user_id=?',serverId,user.id));if(Number(saved?.blocked_until||0)>now)return `Aguarde ${Math.ceil((Number(saved.blocked_until)-now)/1000)} segundos antes de enviar outra mensagem.`;
  const sameWindow=saved&&now-Number(saved.window_started||0)<8000,count=sameWindow?Number(saved.message_count||0)+1:1,started=sameWindow?saved.window_started:now,duplicate=normalized&&normalized===saved?.last_text?Number(saved.duplicate_count||0)+1:1,blocked=count>6||duplicate>3?now+60000:0;
  this.c.storage.sql.exec('INSERT OR REPLACE INTO message_rate_limits VALUES(?,?,?,?,?,?,?)',serverId,user.id,started,count,normalized.slice(0,240),duplicate,blocked);
  if(blocked){this.audit(serverId,user,'SPAM_BLOCK',user.id,user.name,count>6?'Muitas mensagens em poucos segundos':'Mensagem repetida');return 'Proteção contra spam ativada. Aguarde 1 minuto.'}return null;
};
Servers.prototype.fetch=async function(request){
  const url=new URL(request.url);
  if(url.pathname==='/api/servers/_infra/metrics')return advancedAdministrationFetch.call(this,request);
  const user=await this.user(request);if(!user)return j({error:'Não autenticado'},401);
  if(url.pathname==='/api/servers/_turn'&&request.method==='GET'){
    const host=String(this.env.TURN_HOST||'').trim(),secret=String(this.env.TURN_SECRET||'');if(!/^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::[0-9]{1,5})?$/i.test(host)||secret.length<32)return j({error:'TURN próprio ainda não está configurado.'},503);
    const username=`${Math.floor(Date.now()/1000)+3600}:${user.id}`,key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']),signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username)),credential=b64(new Uint8Array(signature));
    return j([{urls:`turn:${host}:3478?transport=udp`,username,credential},{urls:`turn:${host}:3478?transport=tcp`,username,credential}]);
  }
  const join=url.pathname.match(/^\/api\/servers\/join\/([\w-]+)$/);
  if(join&&request.method==='POST'){
    this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_invites(code TEXT PRIMARY KEY,server_id TEXT,created_by TEXT,max_uses INTEGER,uses INTEGER,expires INTEGER,revoked INTEGER,created INTEGER)');this.c.storage.sql.exec('CREATE TABLE IF NOT EXISTS server_bans(server_id TEXT,user_id TEXT,name TEXT,reason TEXT,banned_by TEXT,created INTEGER,PRIMARY KEY(server_id,user_id))');
    const managed=one(this.c.storage.sql.exec('SELECT * FROM server_invites WHERE code=?',join[1])),legacy=managed?null:one(this.c.storage.sql.exec('SELECT id AS server_id FROM servers WHERE invite=?',join[1])),serverId=managed?.server_id||legacy?.server_id;
    if(!serverId)return advancedAdministrationFetch.call(this,request);this.ensureAdvancedAdministration(serverId);
    const settings=one(this.c.storage.sql.exec('SELECT require_approval FROM server_security_settings WHERE server_id=?',serverId));if(!Number(settings?.require_approval)||this.member(serverId,user))return advancedAdministrationFetch.call(this,request);
    if(managed&&(managed.revoked||managed.expires&&managed.expires<Date.now()||managed.max_uses&&managed.uses>=managed.max_uses))return j({error:'Este convite expirou ou não está mais disponível.'},410);
    if(one(this.c.storage.sql.exec('SELECT user_id FROM server_bans WHERE server_id=? AND user_id=?',serverId,user.id)))return j({error:'Você foi banido deste servidor.'},403);
    const existing=one(this.c.storage.sql.exec('SELECT id FROM membership_requests WHERE server_id=? AND user_id=?',serverId,user.id));if(existing)return j({id:serverId,pending:true,request_id:existing.id},202);
    const id=crypto.randomUUID();this.c.storage.sql.exec('INSERT INTO membership_requests VALUES(?,?,?,?,?,?,?)',id,serverId,user.id,user.name,user.color||'#5865f2',join[1],Date.now());if(managed)this.c.storage.sql.exec('UPDATE server_invites SET uses=uses+1 WHERE code=?',join[1]);return j({id:serverId,pending:true,request_id:id},202);
  }
  const serverId=url.pathname.match(/^\/api\/servers\/([\w-]+)(?:\/|$)/)?.[1];if(!serverId)return advancedAdministrationFetch.call(this,request);
  this.ensureAdvancedAdministration(serverId);
  const server=one(this.c.storage.sql.exec('SELECT * FROM servers WHERE id=?',serverId)),isOwner=server?.owner===user.id,member=this.member(serverId,user),can=permission=>this.can(serverId,user,permission);
  if(!member)return advancedAdministrationFetch.call(this,request);
  const managePath=`/api/servers/${serverId}/manage`,settingsPath=`/api/servers/${serverId}/security-settings`,transferPath=`/api/servers/${serverId}/transfer-owner`;
  if(url.pathname===managePath&&request.method==='GET'){
    const response=await advancedAdministrationFetch.call(this,request);if(!response.ok)return response;const data=await response.json(),now=Date.now();
    data.textChannels=[...this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? ORDER BY name',serverId)];data.channelPermissions=[...this.c.storage.sql.exec('SELECT channel_type,channel_id,role_id,allow_mask,deny_mask FROM channel_permissions WHERE server_id=?',serverId)];data.security=one(this.c.storage.sql.exec('SELECT require_approval,anti_spam FROM server_security_settings WHERE server_id=?',serverId));
    data.capabilities.moderateMembers=can('MODERATE_MEMBERS')||can('BAN_MEMBERS');data.capabilities.approveMembers=can('APPROVE_MEMBERS')||can('MANAGE_SERVER');data.capabilities.manageChannelPermissions=can('MANAGE_CHANNEL_PERMISSIONS')||can('MANAGE_CHANNELS');data.capabilities.transferOwnership=isOwner;
    data.pendingMembers=data.capabilities.approveMembers?[...this.c.storage.sql.exec('SELECT id,user_id,name,color,created FROM membership_requests WHERE server_id=? ORDER BY created',serverId)]:[];
    data.members=(data.members||[]).map(item=>({...item,sanctions:[...this.c.storage.sql.exec('SELECT type,until_at,reason FROM member_sanctions WHERE server_id=? AND user_id=? AND (until_at=0 OR until_at>?) ORDER BY created DESC',serverId,item.user_id,now)]}));return j(data);
  }
  if(url.pathname===settingsPath&&request.method==='PATCH'){
    if(!can('MANAGE_SERVER'))return j({error:'Sem permissão para alterar a segurança do servidor.'},403);const body=await request.json().catch(()=>({})),approval=body.require_approval?1:0,antiSpam=body.anti_spam===false?0:1;this.c.storage.sql.exec('INSERT OR REPLACE INTO server_security_settings VALUES(?,?,?,?)',serverId,approval,antiSpam,Date.now());this.audit(serverId,user,'SECURITY_SETTINGS',serverId,server.name,`Aprovação: ${approval?'ativa':'desativada'} · Antispam: ${antiSpam?'ativo':'desativado'}`);return j({security:{require_approval:approval,anti_spam:antiSpam}});
  }
  if(url.pathname===`/api/servers/${serverId}/channel-permissions`&&request.method==='PATCH'){
    if(!can('MANAGE_CHANNEL_PERMISSIONS')&&!can('MANAGE_CHANNELS'))return j({error:'Sem permissão para configurar os canais.'},403);const body=await request.json().catch(()=>({})),type=String(body.channel_type||''),channelId=String(body.channel_id||'').slice(0,64),roleId=String(body.role_id||'');if(!CHANNEL_PERMISSION_KEYS[type])return j({error:'Tipo de canal inválido.'},400);
    const role=one(this.c.storage.sql.exec('SELECT id,name FROM server_roles WHERE server_id=? AND id=?',serverId,roleId)),exists=type==='text'?one(this.c.storage.sql.exec('SELECT name FROM channels WHERE server_id=? AND name=?',serverId,channelId)):one(this.c.storage.sql.exec('SELECT id FROM voice_channels WHERE server_id=? AND id=?',serverId,channelId));if(!role||!exists)return j({error:'Canal ou cargo inválido.'},404);if(roleId===`${serverId}-owner`)return j({error:'O cargo Criador sempre possui acesso total.'},409);
    const allow=this.channelPermissionMask(body.allow,type),deny=this.channelPermissionMask(body.deny,type);if(!allow&&!deny)this.c.storage.sql.exec('DELETE FROM channel_permissions WHERE server_id=? AND channel_type=? AND channel_id=? AND role_id=?',serverId,type,channelId,roleId);else this.c.storage.sql.exec('INSERT OR REPLACE INTO channel_permissions VALUES(?,?,?,?,?,?)',serverId,type,channelId,roleId,allow,deny);this.audit(serverId,user,'CHANNEL_PERMISSIONS',channelId,channelId,`Cargo: ${role.name}`);return j({ok:true,allow_mask:allow,deny_mask:deny});
  }
  const requestAction=url.pathname.match(new RegExp(`^/api/servers/${serverId}/member-requests/([\\w-]+)/(approve|reject)$`));
  if(requestAction&&request.method==='POST'){
    if(!can('APPROVE_MEMBERS')&&!can('MANAGE_SERVER'))return j({error:'Sem permissão para aprovar membros.'},403);const pending=one(this.c.storage.sql.exec('SELECT * FROM membership_requests WHERE id=? AND server_id=?',requestAction[1],serverId));if(!pending)return j({error:'Solicitação não encontrada.'},404);
    if(requestAction[2]==='approve'){this.c.storage.sql.exec('INSERT OR IGNORE INTO members VALUES(?,?,?)',serverId,pending.user_id,'Membro');this.c.storage.sql.exec('INSERT OR REPLACE INTO member_roles VALUES(?,?,?)',serverId,pending.user_id,`${serverId}-member`);this.c.storage.sql.exec('INSERT OR IGNORE INTO member_profiles(server_id,user_id,name,color) VALUES(?,?,?,?)',serverId,pending.user_id,pending.name,pending.color);this.audit(serverId,user,'MEMBER_APPROVE',pending.user_id,pending.name,'Entrada aprovada')}else this.audit(serverId,user,'MEMBER_REJECT',pending.user_id,pending.name,'Entrada recusada');this.c.storage.sql.exec('DELETE FROM membership_requests WHERE id=?',pending.id);return j({ok:true});
  }
  const moderation=url.pathname.match(new RegExp(`^/api/servers/${serverId}/members/([\\w-]+)/moderate$`));
  if(moderation&&request.method==='POST'){
    if(!can('MODERATE_MEMBERS')&&!can('BAN_MEMBERS'))return j({error:'Sem permissão para moderar membros.'},403);const target=one(this.c.storage.sql.exec('SELECT members.user_id,COALESCE(member_profiles.name,"Membro") AS name,COALESCE(server_roles.position,100) AS position FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id LEFT JOIN member_roles ON members.server_id=member_roles.server_id AND members.user_id=member_roles.user_id LEFT JOIN server_roles ON server_roles.id=member_roles.role_id WHERE members.server_id=? AND members.user_id=?',serverId,moderation[1]));if(!target)return j({error:'Membro não encontrado.'},404);if(target.user_id===server.owner||target.user_id===user.id)return j({error:'Este membro não pode receber essa ação.'},409);const current=this.roleFor(serverId,user.id);if(!isOwner&&Number(current?.position??999)>=Number(target.position))return j({error:'Você só pode moderar cargos abaixo do seu.'},403);
    const body=await request.json().catch(()=>({})),action=String(body.action||''),allowed=new Set(['block','timeout','mute','clear']);if(!allowed.has(action))return j({error:'Ação de moderação inválida.'},400);const reason=String(body.reason||'Ação administrativa').trim().slice(0,160),minutes=Math.max(1,Math.min(10080,Number(body.duration_minutes)||10));if(action==='clear'){this.c.storage.sql.exec('DELETE FROM member_sanctions WHERE server_id=? AND user_id=?',serverId,target.user_id);this.audit(serverId,user,'MEMBER_SANCTION_CLEAR',target.user_id,target.name,'Restrições removidas')}else{const until=action==='block'?0:Date.now()+minutes*60000;this.c.storage.sql.exec('INSERT OR REPLACE INTO member_sanctions VALUES(?,?,?,?,?,?,?)',serverId,target.user_id,action,until,reason,user.id,Date.now());this.disconnectVoiceMember(serverId,target.user_id,action==='mute'?'Silenciamento aplicado':'Timeout aplicado');this.audit(serverId,user,`MEMBER_${action.toUpperCase()}`,target.user_id,target.name,`${reason}${until?` · ${minutes} min`:''}`)}return j({ok:true,sanctions:this.activeSanctions(serverId,target.user_id)});
  }
  if(url.pathname===transferPath&&request.method==='POST'){
    if(!isOwner)return j({error:'Somente o criador atual pode transferir o servidor.'},403);const body=await request.json().catch(()=>({})),targetId=String(body.user_id||''),confirmation=String(body.confirmation||'');if(confirmation!==server.name)return j({error:'Digite o nome exato do servidor para confirmar.'},400);if(targetId===user.id)return j({error:'Você já é o criador deste servidor.'},409);const target=one(this.c.storage.sql.exec('SELECT members.user_id,COALESCE(member_profiles.name,"Membro") AS name FROM members LEFT JOIN member_profiles ON members.server_id=member_profiles.server_id AND members.user_id=member_profiles.user_id WHERE members.server_id=? AND members.user_id=?',serverId,targetId));if(!target)return j({error:'Escolha um membro deste servidor.'},404);
    this.c.storage.transactionSync(()=>{this.c.storage.sql.exec('UPDATE servers SET owner=? WHERE id=?',targetId,serverId);this.c.storage.sql.exec('INSERT OR REPLACE INTO member_roles VALUES(?,?,?)',serverId,targetId,`${serverId}-owner`);this.c.storage.sql.exec('INSERT OR REPLACE INTO member_roles VALUES(?,?,?)',serverId,user.id,`${serverId}-admin`);this.c.storage.sql.exec('UPDATE members SET role="Dono" WHERE server_id=? AND user_id=?',serverId,targetId);this.c.storage.sql.exec('UPDATE members SET role="Admin" WHERE server_id=? AND user_id=?',serverId,user.id)});this.audit(serverId,user,'OWNERSHIP_TRANSFER',targetId,target.name,'Propriedade transferida');return j({ok:true,owner:targetId});
  }
  const sanctions=this.activeSanctions(serverId,user.id),blocked=sanctions.some(item=>item.type==='block'),timedOut=sanctions.some(item=>item.type==='timeout'),muted=sanctions.some(item=>item.type==='mute');
  const messages=url.pathname===`/api/servers/${serverId}/messages`,typing=url.pathname===`/api/servers/${serverId}/typing`,search=url.pathname===`/api/servers/${serverId}/messages/search`,pins=url.pathname===`/api/servers/${serverId}/pins`,messageItem=url.pathname.match(new RegExp(`^/api/servers/${serverId}/messages/([\\w-]+)`));
  if((messages||typing)&&request.method==='POST'){
    if(blocked||timedOut)return j({error:blocked?'Você está bloqueado de interagir neste servidor.':'Você está em timeout temporário.'},403);const body=await request.clone().json().catch(()=>({})),channel=String(body.channel||'').slice(0,32);if(!this.canInChannel(serverId,user,'SEND_MESSAGES','text',channel))return j({error:'Seu cargo não pode enviar mensagens neste canal.'},403);if(messages){const safety=this.messageSafety(serverId,user,body.text);if(safety)return j({error:safety},429)}
  }
  if((search||pins)&&request.method==='GET'){const channel=String(url.searchParams.get('channel')||'');if(channel&&!this.canInChannel(serverId,user,'VIEW_CHANNELS','text',channel))return j({error:'Sem acesso a este canal.'},403)}
  if(messageItem){const saved=one(this.c.storage.sql.exec('SELECT channel FROM messages WHERE server_id=? AND id=?',serverId,messageItem[1]));if(saved&&!this.canInChannel(serverId,user,'VIEW_CHANNELS','text',saved.channel))return j({error:'Sem acesso a esta mensagem.'},403)}
  if((blocked||timedOut)&&messageItem&&['POST','PATCH'].includes(request.method))return j({error:blocked?'Você está bloqueado de interagir neste servidor.':'Você está em timeout temporário.'},403);
  const voiceSignal=url.pathname===`/api/servers/${serverId}/voice-signal`,voicePresence=url.pathname===`/api/servers/${serverId}/voice`,voiceChannels=url.pathname===`/api/servers/${serverId}/voice-channels`;
  if((voiceSignal||voicePresence)&&request.method==='POST'){
    const body=await request.clone().json().catch(()=>({})),joining=voicePresence||body.type==='voice-join';if(joining){if(blocked||timedOut||muted)return j({error:muted?'Você está temporariamente silenciado.':'Você não pode entrar na voz durante esta restrição.'},403);const channel=String(body.channel||'Geral');if(!this.canInChannel(serverId,user,'CONNECT_VOICE','voice',channel))return j({error:'Seu cargo não pode entrar neste canal de voz.'},403)}
  }
  const response=await advancedAdministrationFetch.call(this,request);if(!response.ok)return response;
  if(request.method==='GET'&&url.pathname===`/api/servers/${serverId}`){const data=await response.json();data.channels=(data.channels||[]).filter(channel=>this.canInChannel(serverId,user,'VIEW_CHANNELS','text',typeof channel==='string'?channel:channel.name));return j(data)}
  if(request.method==='GET'&&messages){const data=await response.json();data.messages=(data.messages||[]).filter(item=>this.canInChannel(serverId,user,'VIEW_CHANNELS','text',item.channel));data.typing=(data.typing||[]).filter(item=>this.canInChannel(serverId,user,'VIEW_CHANNELS','text',item.channel));return j(data)}
  if(request.method==='GET'&&(search||pins)){const data=await response.json();data.messages=(data.messages||[]).filter(item=>this.canInChannel(serverId,user,'VIEW_CHANNELS','text',item.channel));return j(data)}
  if(request.method==='GET'&&voiceChannels){const data=await response.json();data.channels=(data.channels||[]).filter(channel=>this.canInChannel(serverId,user,'CONNECT_VOICE','voice',channel.id));return j(data)}
  if(request.method==='GET'&&voicePresence){const data=await response.json();data.users=(data.users||[]).filter(item=>this.canInChannel(serverId,user,'CONNECT_VOICE','voice',item.channel));return j(data)}return response;
};
