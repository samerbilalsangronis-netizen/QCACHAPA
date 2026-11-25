import {lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import Portal from './shop/Portal';
import Checkout from './shop/Checkout';
import Tracking from './shop/Tracking';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource-variable/dm-sans/wght.css';
import './style.css';
import './portal.css';

const Staff = lazy(() => import('./Staff'));

const path = location.pathname.replace(/\/+$/, '');
const page = path === '/personal' || path.startsWith('/personal/') ? <Staff/>
  : path === '/checkout' ? <Checkout/>
    : path === '/pedido' ? <Tracking/> : <Portal/>;
createRoot(document.getElementById('root')!).render(<Suspense fallback={<main className="shell">Cargando…</main>}>{page}</Suspense>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
