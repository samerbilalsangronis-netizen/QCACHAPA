import {useEffect,useRef,type FormEvent,type ReactNode} from 'react';
import type {Business} from '../model';

export type VisitorSection = 'location'|'reserve';

function VisitorDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {ref.current?.showModal();},[]);
  return <dialog className="store-dialog visitor-dialog" ref={ref} onClose={onClose} aria-labelledby="visitor-title">
    <div className="row store-dialog-heading">
      <h2 id="visitor-title">{title}</h2>
      <button type="button" className="secondary" aria-label="Cerrar" onClick={() => ref.current?.close()}>×</button>
    </div>
    {children}
  </dialog>;
}

export default function VisitorDialogs({section,business,onClose}:{
  section:VisitorSection;business:Business;onClose:()=>void;
}) {
  const destination = business.address?.trim();
  const whatsapp = business.whatsapp?.replace(/\D/g,'');
  const today = new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeZone:business.timezone}).format(new Date());
  function directions(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!destination) return;
    const origin = String(new FormData(event.currentTarget).get('origin') ?? '').trim();
    const params = new URLSearchParams({api:'1',destination});
    if (origin) params.set('origin',origin);
    window.open('https://www.google.com/maps/dir/?'+params,'_blank','noopener,noreferrer');
  }

  function requestReservation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!whatsapp) return;
    const values = new FormData(event.currentTarget);
    const text = [
      'Hola, quisiera solicitar una reserva en '+business.name+'.',
      'Nombre: '+values.get('name'),
      'Fecha: '+values.get('date'),
      'Hora: '+values.get('time'),
      'Personas: '+values.get('guests'),
      values.get('notes') ? 'Observaciones: '+values.get('notes') : '',
    ].filter(Boolean).join('\n');
    window.open('https://wa.me/'+whatsapp+'?'+new URLSearchParams({text}),'_blank','noopener,noreferrer');
  }

  if (section === 'location') return <VisitorDialog title="Ubicación" onClose={onClose}>
    {destination ? <>
      <p className="visitor-address">{destination}</p>
      {business.hours && <p>{business.hours}</p>}
      <form onSubmit={directions}>
        <label>Punto de partida (opcional)<input name="origin" placeholder="Dirección o punto de referencia…" maxLength={180}/></label>
        <button>Ver recorrido en Google Maps</button>
      </form>
      <a className="visitor-map-link" href={'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:destination})}
        target="_blank" rel="noopener noreferrer">Ver solo el mapa</a>
    </> : <p>La dirección aparecerá aquí cuando el negocio la configure.</p>}
  </VisitorDialog>;

  return <VisitorDialog title="Reserva tu mesa" onClose={onClose}>
    <p>Envía tu solicitud por WhatsApp. El equipo te confirmará la disponibilidad.</p>
    {!whatsapp && <p className="notice">Las solicitudes de reserva se habilitarán cuando el negocio configure su WhatsApp.</p>}
    <form onSubmit={requestReservation}>
      <label>Nombre<input name="name" autoComplete="name" required maxLength={100}/></label>
      <div className="visitor-fields">
        <label>Fecha<input name="date" type="date" min={today} required/></label>
        <label>Hora<input name="time" type="time" required/></label>
        <label>Personas<input name="guests" type="number" min={1} max={60} defaultValue={2} required/></label>
      </div>
      <label>Observaciones (opcional)<textarea name="notes" maxLength={300}/></label>
      <button disabled={!whatsapp}>Solicitar por WhatsApp</button>
    </form>
  </VisitorDialog>;
}
