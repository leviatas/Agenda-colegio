import { ORDER } from '../lib/agenda';

const NIVELES = [
  { n: 'per', label: 'Personales' },
  { n: 'fer', label: 'Feriados' },
  { n: 'ins', label: 'Institucional' },
  { n: 'ini', label: 'Inicial' },
  { n: 'pri', label: 'Primaria' },
  { n: 'sec', label: 'Secundaria' },
];

export default function Legend({ eventos, visible }) {
  const cuenta = Object.fromEntries(Object.keys(ORDER).map((k) => [k, 0]));
  eventos.forEach((ev) => {
    if (visible(ev)) cuenta[ev.level] += 1;
  });

  return (
    <div className="legend">
      {NIVELES.map(({ n, label }) => (
        <span key={n} className={`lg ${n}${cuenta[n] === 0 ? ' off' : ''}`}>
          <i />
          {label} <span className="qty">{cuenta[n] || '—'}</span>
        </span>
      ))}
    </div>
  );
}
