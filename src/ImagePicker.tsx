import {useEffect,useId,useRef,useState} from 'react';
import {imageAccept,imageProblem} from './catalogImages';

export default function ImagePicker({name,label,current,fallback}:{name:string;label:string;current:string|null|undefined;fallback?:string}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [removed,setRemoved] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => {
    if (!file) {setPreview('');return;}
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  },[file]);

  function resetSelection(remove:boolean) {
    if (input.current) {
      input.current.value = '';
      input.current.setCustomValidity('');
    }
    setFile(null);
    setError('');
    setRemoved(remove);
  }

  const image = preview || (removed ? fallback : current || fallback);
  return <div className="image-picker">
    <div className="image-picker-preview" aria-hidden="true">
      {image ? <img key={image} src={image} alt="" width={96} height={80} onError={() => {
        if (!file || !preview) return;
        const problem = 'No se pudo abrir la imagen. Elige otro archivo.';
        input.current?.setCustomValidity(problem);
        setError(problem);
      }}/> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.2"/><path d="m3 16 4-4 4 4 4-5 6 6"/>
      </svg>}
    </div>
    <div className="image-picker-body">
      <label htmlFor={id}>{label}</label>
      <p id={id+'-hint'}>JPG, PNG, WebP o AVIF. Hasta 5 MB.</p>
      <div className="image-picker-actions">
        <div className="image-picker-select">
          <span aria-hidden="true">Elegir imagen</span>
          <input ref={input} id={id} name={name} type="file" accept={imageAccept}
            aria-describedby={id+'-hint'+(error ? ' '+id+'-error' : '')} aria-invalid={Boolean(error)} onChange={event => {
              const field = event.currentTarget;
              const chosen = field.files?.[0];
              const problem = chosen ? imageProblem(chosen) : '';
              field.setCustomValidity(problem);
              setError(problem);
              setFile(!problem && chosen ? chosen : null);
            }}/>
        </div>
        {file && <span className="image-picker-filename">{file.name}</span>}
      </div>
      {removed && !file && <input type="hidden" name={name+'_remove'} value="yes"/>}
      {(file || error || current) && <button type="button" className="text-button"
        onClick={() => resetSelection(!file && !error && !removed)}>
        {file || error ? 'Cancelar selección' : removed ? 'Restaurar imagen' : 'Quitar imagen'}
      </button>}
      {error && <p id={id+'-error'} role="alert" className="image-picker-error">{error}</p>}
    </div>
  </div>;
}
