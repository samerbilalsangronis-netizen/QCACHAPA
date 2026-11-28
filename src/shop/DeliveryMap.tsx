import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {Coordinates} from './checkoutModel';

export default function DeliveryMap({initial,value,onChange}:{
  initial:Coordinates|null; value:Coordinates|null; onChange:(value:Coordinates|null)=>void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map|null>(null);
  const marker = useRef<L.CircleMarker|null>(null);
  const [finding,setFinding] = useState(false);
  const [message,setMessage] = useState('');

  useEffect(()=>{
    if (!container.current) return;
    const center = initial ? L.latLng(initial.latitude,initial.longitude) : L.latLng(7.1,-66.1);
    const instance = L.map(container.current,{scrollWheelZoom:false}).setView(center,initial ? 15 : 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    instance.on('click',event=>{
      const point = event.latlng.wrap();
      onChange({latitude:point.lat,longitude:point.lng});
      setMessage('');
    });
    map.current = instance;
    return ()=>{instance.remove();map.current=null;marker.current=null;};
  },[initial,onChange]);

  useEffect(()=>{
    if (!map.current) return;
    marker.current?.remove();
    marker.current = null;
    if (value) {
      const point = L.latLng(value.latitude,value.longitude);
      marker.current = L.circleMarker(point,{radius:8,color:'#fff8e8',weight:3,fillColor:'#a84525',fillOpacity:1}).addTo(map.current);
      map.current.setView(point,Math.max(map.current.getZoom(),15));
    }
  },[value,initial,onChange]);

  function find() {
    setMessage('');
    if (!navigator.geolocation) {
      setMessage('Marca el punto en el mapa o escribe la dirección.');
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(({coords})=>{
      setFinding(false);
      onChange({latitude:coords.latitude,longitude:coords.longitude});
    },()=>{
      setFinding(false);
      setMessage('No pudimos ubicarte. Puedes marcar el punto o escribir la dirección.');
    },{timeout:10000});
  }

  return <div className="delivery-map">
    <div className="delivery-map-heading"><p>Ubicación en el mapa <small>(opcional)</small></p>
      <button type="button" className="secondary" onClick={find} disabled={finding}>{finding ? 'Buscando…' : 'Usar mi ubicación'}</button>
    </div>
    <div className="delivery-map-surface" ref={container} aria-label="Mapa para marcar la entrega"/>
    <p className="web-basket-note" aria-live="polite">{message || (value ? 'Punto de entrega seleccionado.' : 'Toca el mapa para marcar el punto de entrega.')}</p>
    {value && <button type="button" className="text-button" onClick={()=>onChange(null)}>Quitar ubicación</button>}
  </div>;
}
