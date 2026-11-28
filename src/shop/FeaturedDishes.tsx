import {useEffect,useRef,useState} from 'react';
import type {Product} from '../model';
import {money} from '../model';

import {featuredDishes,matchingProduct,referencePhoto} from './featuredMenu';

export default function FeaturedDishes({products,ordering,onOrder,onBrowse,background}:{
  background?:string|null;
  products:readonly Product[];
  ordering:boolean;
  onOrder:(product:Product)=>void;
  onBrowse:(category:string,categoryId?:string)=>void;
}) {
  const section = useRef<HTMLElement>(null);
  const [visible,setVisible] = useState(false);
  const [pageVisible,setPageVisible] = useState(() => !document.hidden);
  const [playing,setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [active,setActive] = useState(0);
  const slides = featuredDishes.map(dish => ({dish,product:matchingProduct(dish,products)}));
  const {dish:current,product} = slides[active];
  const advancing = playing && visible && pageVisible;

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting),{threshold:.25});
    observer.observe(element);
    return () => observer.disconnect();
  },[]);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduceMotion = () => {if (preference.matches) setPlaying(false);};
    const updateVisibility = () => setPageVisible(!document.hidden);
    preference.addEventListener('change',reduceMotion);
    document.addEventListener('visibilitychange',updateVisibility);
    return () => {
      preference.removeEventListener('change',reduceMotion);
      document.removeEventListener('visibilitychange',updateVisibility);
    };
  },[]);

  useEffect(() => {
    if (!advancing) return;
    const timer = window.setTimeout(() => setActive((active+1)%featuredDishes.length),7000);
    return () => window.clearTimeout(timer);
  },[advancing,active]);

  function select(index:number) {
    setPlaying(false);
    setActive((index+featuredDishes.length)%featuredDishes.length);
  }

  return <section ref={section} className="food-feature"
    aria-label="Destacados del menú" aria-roledescription="carrusel" onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        select(active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }}>
    <div className="food-feature-image">
      {background && <img src={background} className="food-feature-background" alt=""/>}
      {slides.map(({dish,product:entry},index) => <picture key={dish.cover} className={active === index ? 'is-active' : ''}
        aria-hidden={active !== index}>
        <source media="(min-width: 761px) and (min-aspect-ratio: 5/4)" srcSet={referencePhoto(dish,entry,true)}/>
        <img src={referencePhoto(dish,entry)} alt={active === index ? dish.name : ''}
          loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'}/>
      </picture>)}
    </div>
    <div className="shell food-feature-layout">
      <div className="food-feature-copy">
        <div aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          <div className="food-feature-caption" key={current.cover}>
            <p className="food-feature-category">{current.label ?? current.category}</p>
            <h1>{current.name}</h1>
            <p>{product?.description || current.description}</p>
          </div>
        </div>
        <div className="food-feature-order">
          {product && ordering ? <button type="button" className="button portal-primary" onFocus={() => setPlaying(false)}
            onClick={() => onOrder(product)}>Ordenar <span>{money(product.price)}</span></button>
            : <a className="button portal-primary" href="#menu" onFocus={() => setPlaying(false)}
              onClick={() => onBrowse(current.category,product?.category_id)}>
              Ver la carta <span aria-hidden="true">↓</span>
            </a>}
        </div>
        <div className="food-feature-controls" role="group" aria-label="Recorrer los platos destacados">
          <div className="food-feature-dots">
            {featuredDishes.map((dish,index) => <button type="button" aria-label={dish.name} aria-pressed={active === index}
              key={dish.cover} onClick={() => select(index)}>
              <span className={advancing && active === index ? 'is-advancing' : ''} aria-hidden="true"/>
            </button>)}
          </div>
          <div className="food-feature-transport">
            <button type="button" aria-label="Plato anterior" onClick={() => select(active-1)}>←</button>
            <button type="button" aria-label="Siguiente plato" onClick={() => select(active+1)}>→</button>
            <button type="button" aria-label={playing ? 'Pausar transición' : 'Reproducir transición'} onClick={() => setPlaying(!playing)}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                {playing ? <path d="M6 4h2v12H6zm6 0h2v12h-2z"/> : <path d="m6 4 10 6-10 6z"/>}
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
