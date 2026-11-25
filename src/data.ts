import {useCallback,useEffect,useRef,useState} from 'react';
import {db, initialBusiness, type Business, type Category, type Product} from './model';

export function useCatalog(refreshWhileVisible = false) {
  const [business,setBusiness] = useState<Business>(initialBusiness);
  const [categories,setCategories] = useState<Category[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [loading,setLoading] = useState(Boolean(db));
  const [error,setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!db) return;
    const version = ++request.current;
    const [settings,groups,items] = await Promise.all([
      db.from('business').select('*').single(),
      db.from('categories').select('*').order('name'),
      db.from('products').select('*').order('name'),
    ]);
    if (version !== request.current) return;
    const problem = settings.error || groups.error || items.error;
    setError(problem?.message ?? '');
    if (settings.data) setBusiness(settings.data);
    if (groups.data) setCategories(groups.data);
    if (items.data) setProducts(items.data);
    setLoading(false);
  },[]);
  useEffect(() => {
    void refresh();
    const channel = db?.channel('menu')
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'products'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'business'},refresh)
      .subscribe();
    window.addEventListener('online',refresh);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
    };
    const timer = db && refreshWhileVisible ? window.setInterval(refreshVisible,20000) : undefined;
    if (timer !== undefined) document.addEventListener('visibilitychange',refreshVisible);
    return () => {
      request.current++;
      if (timer !== undefined) {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange',refreshVisible);
      }
      if (channel) void db?.removeChannel(channel);
      window.removeEventListener('online',refresh);
    };
  },[refresh,refreshWhileVisible]);
  return {business,categories,products,loading,error,refresh};
}
export type Catalog = ReturnType<typeof useCatalog>;

export function useOnline() {
  const [online,setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
    return () => {
      window.removeEventListener('online',update);
      window.removeEventListener('offline',update);
    };
  },[]);
  return online;
}
