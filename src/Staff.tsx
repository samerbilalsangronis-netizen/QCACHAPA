import {lazy,Suspense,useEffect,useState,type FormEvent,type MouseEvent,type ReactNode} from 'react';
import {type Session} from '@supabase/supabase-js';
import {useCatalog,useOnline,type Catalog} from './data';
import {db, type Business, type Role} from './model';
import {Cashier,Kitchen} from './Operations';
import Brand from './Brand';
import {isAdminView,isCashierView,staffNavigation,staffRoute,staffRoutes,type StaffRoute} from './staffRoutes';
import './staff.css';

const Admin = lazy(() => import('./Admin'));

function AccessFrame({business,children}:{business:Business;children:ReactNode}) {
  return <main className="staff staff-access">
    <div className="staff-access-photo">
      <img className="staff-kitchen-photo" src="/cocina-personal.webp" alt="" width={960} height={1280}/>
      <div className="staff-access-photo-brand"><Brand className="staff-brand" business={business}/></div>
    </div>
    <div className="staff-access-body">
      <a className="staff-back" href="/"><span aria-hidden="true">←</span> Volver a la web</a>
      <section className="staff-access-form">{children}</section>
    </div>
  </main>;
}

function PasswordField({creating=false}:{creating?:boolean}) {
  const [visible,setVisible] = useState(false);
  return <div className="staff-password-field">
    <label htmlFor="staff-password">Contraseña</label>
    <span className="staff-password">
      <input id="staff-password" name="password" type={visible ? 'text' : 'password'}
        required autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 12 : undefined}/>
      <button type="button" className="text-button" aria-controls="staff-password" onClick={() => setVisible(!visible)}>
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </span>
  </div>;
}

function Login({catalog}:{catalog:Catalog}) {
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [reset,setReset] = useState(false);
  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email'));
    setBusy(true);
    setError('');
    try {
      const result = reset
        ? await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/personal/'})
        : await db.auth.signInWithPassword({email,password:String(fields.get('password'))});
      if (result.error) setError(reset ? 'No se pudo solicitar la recuperación.' : 'Revisa el correo y la contraseña.');
      else if (reset) setError('Si el correo está registrado, recibirás un enlace de recuperación.');
    } catch {
      setError('No se pudo conectar con el servicio de acceso. Intenta de nuevo.');
    } finally { setBusy(false); }
  }
  return <AccessFrame business={catalog.business}>
    <h1>{reset ? 'Recuperar acceso' : 'Acceso del personal'}</h1>
    <p className="staff-form-intro">{reset ? 'Te enviaremos un enlace para cambiar tu contraseña.' : 'Ingresa con tu cuenta de trabajo.'}</p>
    {!db && <p className="notice" role="status">El servicio de acceso todavía no está configurado.</p>}
    <form onSubmit={signIn}>
      <label>Correo electrónico<input name="email" type="email" autoComplete={reset ? 'email' : 'username'} spellCheck={false} required/></label>
      {!reset && <PasswordField/>}
      {error && <p role="status" className="notice">{error}</p>}
      <button className="staff-submit" disabled={busy || !db}>
        {busy ? (reset ? 'Enviando…' : 'Ingresando…') : (reset ? 'Enviar enlace' : 'Ingresar')}
      </button>
      <button type="button" className="text-button staff-reset" disabled={busy} onClick={() => {setReset(!reset);setError('');}}>
        {reset ? 'Volver al acceso' : 'Olvidé mi contraseña'}
      </button>
    </form>
  </AccessFrame>;
}

export default function Staff() {
  const catalog = useCatalog();
  const online = useOnline();
  const [session,setSession] = useState<Session|null|undefined>(undefined);
  const [role,setRole] = useState<Role|null|undefined>();
  const [path,setPath] = useState(location.pathname);
  const [recovery,setRecovery] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(() => {
    if (!db) {setSession(null);return;}
    const {data:{subscription}} = db.auth.onAuthStateChange((event,current) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(current);
    });
    return () => subscription.unsubscribe();
  },[]);
  const user = session?.user.id;
  useEffect(() => {
    setRole(undefined);
    if (!user || !db) return;
    let active = true;
    void db.from('staff').select('role').eq('id',user).maybeSingle().then(({data,error}) => {
      if (!active) return;
      const next = (data?.role as Role|undefined) ?? null;
      setRole(next);
      setMessage(error ? 'No se pudieron consultar los permisos.' : '');
      void catalog.refresh();
    });
    return () => {active = false;};
  },[user,catalog.refresh]);

  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener('popstate',sync);
    return () => window.removeEventListener('popstate',sync);
  },[]);

  const section = role ? staffRoute(role,path) : null;
  useEffect(() => {
    if (!section || recovery || path === staffRoutes[section].path) return;
    const canonical = staffRoutes[section].path;
    history.replaceState(null,'',canonical + location.search + location.hash);
    setPath(canonical);
  },[path,recovery,section]);

  function navigate(route:StaffRoute, event?:MouseEvent<HTMLAnchorElement>) {
    if (event && (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)) return;
    event?.preventDefault();
    const next = staffRoutes[route].path;
    if (next === path) return;
    history.pushState(null,'',next);
    setPath(next);
    window.scrollTo({top:0,behavior:'instant'});
  }

  if (recovery) return <AccessFrame business={catalog.business}>
    <h1>Nueva contraseña</h1>
    <p className="staff-form-intro">Usa al menos 12 caracteres.</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!db) return;
      const fields = new FormData(event.currentTarget);
      const {error} = await db.auth.updateUser({password:String(fields.get('password'))});
      if (error) setMessage(error.message);
      else {setRecovery(false);setMessage('');}
    }}>
      <PasswordField creating/>
      {message && <p role="alert" className="notice">{message}</p>}
      <button className="staff-submit">Guardar contraseña</button>
    </form>
  </AccessFrame>;
  if (session === undefined || (session && role === undefined)) return <main className="staff staff-loading" role="status">Comprobando acceso…</main>;
  if (!session) return <Login catalog={catalog}/>;

  return <div className="staff staff-dashboard">
    <header className="staff-header">
      <div className="shell staff-header-inner">
        <Brand className="staff-brand" business={catalog.business}/>
        <div className="staff-utilities">
          <span role="status" className={'staff-connection ' + (online ? 'online' : 'offline')}>
            <span aria-hidden="true"/>{online ? 'En línea' : 'Sin conexión'}
          </span>
          <button type="button" className="secondary" onClick={async () => {
            const result = await db?.auth.signOut();
            if (result?.error) setMessage('No se pudo cerrar la sesión. Intenta de nuevo.');
          }}>Cerrar sesión</button>
        </div>
      </div>
    </header>
    <div className="shell staff-frame">
      {role && <nav className="staff-sidebar" aria-label="Panel de trabajo">
        {staffNavigation(role).map(item => <a key={item} href={staffRoutes[item].path}
          aria-current={section === item || (section === 'manual' && item === 'orders') ? 'page' : undefined}
          onClick={event => navigate(item,event)}>{staffRoutes[item].label}</a>)}
      </nav>}
      <main className="workspace staff-workspace">
        {role === null ? <p role="alert" className="notice">{message || 'Tu cuenta no tiene un perfil activo de personal.'}</p> : <>
          {message && <p role="alert" className="notice">{message}</p>}
          <Suspense fallback={<p role="status">Cargando panel…</p>}>
            {section && isAdminView(section) && <Admin catalog={catalog} user={session.user.id} section={section}/>}
            {section && isCashierView(section) && <Cashier catalog={catalog} user={session.user.id} admin={role === 'admin'} view={section} navigate={navigate}/>}
            {section === 'kitchen' && <Kitchen timezone={catalog.business.timezone}/>}
          </Suspense>
        </>}
      </main>
    </div>
  </div>;
}
