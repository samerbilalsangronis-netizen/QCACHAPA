import {useEffect,useRef,useState} from 'react';
import type {Product} from '../model';
import {money} from '../model';

import {cachapaDishes,lunchDishes,matchingProduct,referencePhoto} from './featuredMenu';

export default function FeaturedDishes({group,category,products,ordering,onOrder,onBrowse,background}:{
  group:'lunch'|'cachapa';
  category:string;
  background?:string|null;
  products:readonly Product[];
  ordering:boolean;
  onOrder:(product:Product)=>void;
  onBrowse:()=>void;
}) {
  const lunch = group === 'lunch';
  const dishes = lunch ? lunchDishes : cachapaDishes;
  const section = useRef<HTMLElement>(null);
  const [visible,setVisible] = useState(false);
  const [playing,setPlaying] = useState(() => lunch && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [active,setActive] = useState(0);
  const current = dishes[active];
  const product = matchingProduct(current,products);
  const Heading = lunch ? 'h1' : 'h2';

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting),{threshold:.25});
    observer.observe(element);
    return () => observer.disconnect();
  },[]);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {if (preference.matches) setPlaying(false);};
    preference.addEventListener('change',change);
    return () => preference.removeEventListener('change',change);
  },[]);

  useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index+1)%dishes.length);
    },6000);
    return () => window.clearInterval(timer);
  },[playing,visible,dishes.length]);

  function select(index:number) {
    setPlaying(false);
    setActive((index+dishes.length)%dishes.length);
  }

  return <section ref={section} className={'food-feature food-feature-'+group}
    aria-label={category} aria-roledescription="carrusel" onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        select(active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }}>
    {background && <img src={background} className="food-feature-background" alt=""/>}
    <div className="shell food-feature-layout">
      <div className="food-feature-copy">
        <p className="food-feature-category">{lunch ? 'Almuerzos venezolanos' : 'Pide tu cachapa todo el día'}</p>
        <div aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          <div className="food-feature-caption" key={current.image}>
            <Heading>{current.name}</Heading>
            <p>{product?.description || current.description}</p>
          </div>
        </div>
        <div className="food-feature-order">
          {product && ordering ? <button type="button" className="button portal-primary" onFocus={() => setPlaying(false)}
            onClick={() => onOrder(product)}>Ordenar <span>{money(product.price)}</span></button>
            : <a className="button portal-primary" href="#menu" onFocus={() => setPlaying(false)} onClick={onBrowse}>
              {lunch ? 'Ver menú de almuerzos' : 'Ver menú de cachapas'} <span aria-hidden="true">↓</span>
            </a>}
        </div>
        <div className="food-feature-controls" aria-label={'Recorrer '+category.toLocaleLowerCase('es')}>
          <button type="button" aria-label="Plato anterior" onClick={() => select(active-1)}>←</button>
          <div className="food-feature-dots">
            {dishes.map((dish,index) => <button type="button" aria-label={dish.name} aria-pressed={active === index}
              key={dish.image} onClick={() => select(index)}><span aria-hidden="true"/></button>)}
          </div>
          <button type="button" aria-label="Siguiente plato" onClick={() => select(active+1)}>→</button>
          {lunch && <button type="button" aria-label={playing ? 'Pausar transición' : 'Reproducir transición'} onClick={() => setPlaying(!playing)}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
              {playing ? <path d="M6 4h2v12H6zm6 0h2v12h-2z"/> : <path d="m6 4 10 6-10 6z"/>}
            </svg>
          </button>}
        </div>
      </div>
      <div className="food-feature-image">
        {dishes.map((dish,index) => {
          return <img key={dish.image} className={active === index ? 'is-active' : ''}
            src={referencePhoto(dish,matchingProduct(dish,products))}
            alt={active === index ? dish.name : ''} aria-hidden={active !== index} width={740} height={740}
            loading={lunch && index === 0 ? 'eager' : 'lazy'} fetchPriority={lunch && index === 0 ? 'high' : 'auto'}/>;
        })}
      </div>
    </div>
  </section>;
}
