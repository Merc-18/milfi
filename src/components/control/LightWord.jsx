import { LIGHT_DOT } from '../../presentation/tones.js';

// A semáforo dot, always with its word.
export default function LightWord({ light, word }) {
  return <span className="inline-flex items-center gap-1.5 font-bold" data-light={light}>
    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-texto/40 ${LIGHT_DOT[light]}`} aria-hidden="true" />{word}</span>;
}
