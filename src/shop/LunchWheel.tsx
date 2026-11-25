import {useEffect,useRef,useState} from 'react';

const lunches = [
  {id:'pabellon',name:'Pabellón criollo',description:'Carne mechada, caraotas negras, arroz y tajadas.'},
  {id:'pollo',name:'Pollo guisado',description:'Pollo con papas y zanahorias, arroz y ensalada.'},
  {id:'asado',name:'Asado negro',description:'Carne en salsa oscura con arroz y plátano maduro.'},
  {id:'pescado',name:'Pescado frito',description:'Pescado dorado con patacones y ensalada fresca.'},
];

export default function LunchWheel({background,slogan}:{background:string|null;slogan:string}) {
  const [active,setActive] = useState(0);
  const [playing,setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const start = useRef<{x:number;y:number}|null>(null);

  function choose(index:number) {
    setPlaying(false);
    setActive((index+lunches.length)%lunches.length);
  }

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {if (media.matches) setPlaying(false);};
    media.addEventListener('change',change);
    return () => media.removeEventListener('change',change);
  },[]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index+1)%lunches.length);
    },5400);
    return () => window.clearInterval(timer);
  },[playing]);

  const lunch = lunches[active];
  return <section className="lunch-wheel" aria-label="Almuerzos venezolanos" aria-roledescription="carrusel"
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        choose(active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }}>
    {background && <img className="wheel-background" src={background} alt=""/>}
    <div className="shell wheel-layout">
      <div className="wheel-copy">
        <p className="wheel-eyebrow">Cocina venezolana desde 2007</p>
        <h1>De almuerzo <br/>a cena</h1>
        <p className="wheel-slogan">{slogan}</p>
        <a className="button portal-primary" href="#menu">Explorar el menú <span aria-hidden="true">↓</span></a>
      </div>
      <div className="wheel-display">
        <div className="wheel-plates" onPointerDown={event => {
          if (event.pointerType === 'mouse') return;
          start.current = {x:event.clientX,y:event.clientY};
        }} onPointerCancel={() => {start.current = null;}} onPointerUp={event => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) choose(active + (dx < 0 ? 1 : -1));
        }}>
          {lunches.map((item,index) => {
            const step = (index-active+lunches.length)%lunches.length;
            return <img key={item.id} className="wheel-plate" data-step={step} src={'/almuerzo-'+item.id+'.webp'}
              width={600} height={600} alt={step === 0 ? item.name : ''} aria-hidden={step !== 0}
              draggable={false} fetchPriority={index === 0 ? 'high' : 'low'}/>;
          })}
        </div>
        <div className="wheel-meta">
          <div aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
            <div key={lunch.id} className="wheel-caption">
              <h2>{lunch.name}</h2><p>{lunch.description}</p>
            </div>
          </div>
          <div className="wheel-controls" aria-label="Recorrer almuerzos">
            <button type="button" aria-label="Almuerzo anterior" onClick={() => choose(active-1)}>←</button>
            <div className="wheel-dots">
              {lunches.map((item,index) => <button type="button" aria-label={item.name} aria-pressed={active===index}
                key={item.id} onClick={() => choose(index)}><span/></button>)}
            </div>
            <button type="button" aria-label="Siguiente almuerzo" onClick={() => choose(active+1)}>→</button>
            <button type="button" aria-label={playing ? 'Pausar animación' : 'Reproducir animación'} onClick={() => setPlaying(!playing)}>
              <span aria-hidden="true">{playing ? 'Ⅱ' : '▶︎'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
