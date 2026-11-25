import {lazy,Suspense,useEffect,useState,type FormEvent} from 'react';
import {type Session} from '@supabase/supabase-js';
import {useCatalog,useOnline,type Catalog} from './data';
import {db, type Role} from './model';
import {Cashier,Kitchen} from './Operations';

const Admin = lazy(() => import('./Admin'));
const panels = {admin:'Administración',cashier:'Caja',kitchen:'Cocina'};

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
    } finally { setBusy(false); }
  }
  const {business} = catalog;
  return <main className="shell narrow">
    <a className="brand" href="/">{business.logo_url ? <img src={business.logo_url} alt={business.name}/> : business.name}</a>
    <section className="panel"><h1>{reset ? 'Recuperar acceso' : 'Acceso del personal'}</h1>
      {!db && <p className="notice">El servicio de acceso todavía no está configurado.</p>}
      <form onSubmit={signIn}>
        <label>Correo electrónico<input name="email" type="email" autoComplete="username" required/></label>
        {!reset && <label>Contraseña<input name="password" type="password" autoComplete="current-password" required/></label>}
        {error && <p role="status" className="notice">{error}</p>}
        <button disabled={busy || !db}>{reset ? 'Enviar enlace' : 'Ingresar'}</button>
        <button type="button" className="text-button" onClick={() => {setReset(!reset);setError('');}}>{reset ? 'Volver al acceso' : 'Olvidé mi contraseña'}</button>
      </form>
    </section>
  </main>;
}

export default function Staff() {
  const catalog = useCatalog();
  const online = useOnline();
  const [session,setSession] = useState<Session|null|undefined>(undefined);
  const [role,setRole] = useState<Role|null|undefined>();
  const [panel,setPanel] = useState<Role>('admin');
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
      setPanel(next ?? 'admin');
      setMessage(error ? 'No se pudieron consultar los permisos.' : '');
      void catalog.refresh();
    });
    return () => {active = false;};
  },[user,catalog.refresh]);

  if (recovery) return <main className="shell narrow"><section className="panel"><h1>Nueva contraseña</h1>
    <form onSubmit={async event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const {error} = await db!.auth.updateUser({password:String(fields.get('password'))});
      if (error) setMessage(error.message);
      else {setRecovery(false);setMessage('');}
    }}><label>Contraseña<input name="password" type="password" minLength={12} required autoComplete="new-password"/></label>
      {message && <p role="alert">{message}</p>}<button>Guardar contraseña</button></form></section></main>;
  if (session === undefined || (session && role === undefined)) return <main className="shell narrow">Comprobando acceso…</main>;
  if (!session) return <Login catalog={catalog}/>;

  return <>
    <header className="shell masthead"><a className="brand" href="/">{catalog.business.name}</a><div className="row">
      <span role="status" className={online ? 'muted' : 'notice'}>{online ? 'En línea' : 'Sin conexión'}</span>
      <button className="secondary" onClick={() => void db?.auth.signOut()}>Cerrar sesión</button>
    </div></header>
    <main className="shell workspace">
      {role === null ? <p role="alert" className="notice">{message || 'Tu cuenta no tiene un perfil activo de personal.'}</p> : <>
        {role === 'admin' && <nav className="chips" aria-label="Paneles">
          {(Object.keys(panels) as Role[]).map(item => <button key={item} aria-pressed={panel === item} onClick={() => setPanel(item)}>{panels[item]}</button>)}
        </nav>}
        <Suspense fallback={<p>Cargando panel…</p>}>
          {panel === 'admin' && <Admin catalog={catalog} user={session.user.id}/>}
          {panel === 'cashier' && <Cashier catalog={catalog} user={session.user.id} admin={role === 'admin'}/>}
          {panel === 'kitchen' && <Kitchen timezone={catalog.business.timezone}/>}
        </Suspense>
      </>}
    </main>
  </>;
}
