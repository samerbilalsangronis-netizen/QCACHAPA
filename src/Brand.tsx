import type {Business} from './model';

export default function Brand({business,className=''}:{business:Business;className?:string}) {
  const logo = business.logo_url?.trim();
  return <a className={`brand ${className}`.trim()} href="/">
    {logo
      ? <img src={logo} alt={business.name}/>
      : <img src="/logo-qcachapas.webp" alt={business.name} width={720} height={553}/>}
  </a>;
}
