import { TONE_CLASS } from '../../presentation/tones.js';

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CLASS[tone]} ${className}`}>{children}</span>;
}
