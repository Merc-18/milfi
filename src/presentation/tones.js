// Semantic status tones derived from the palette. Color never carries the state
// alone: every badge or notice has its own text (and the exceeded state a "−").
export const TONE_CLASS = Object.freeze({
  ok: 'bg-exito text-texto',
  aviso: 'bg-acento text-texto',
  neutral: 'bg-secundario text-texto',
  excedido: 'bg-excedido text-white',
});
export const noticeClass = (tone = 'aviso') => `rounded-xl px-3 py-2 text-sm ${TONE_CLASS[tone]}`;

// Traffic-light card backgrounds by tone, with the text color that keeps ≥ 4.5:1
// (texto on verde/amarillo/gris ≈ 6.4–6.6; white on rojo ≈ 7.2; texto-light fails on all).
export const LIGHT_CARD = Object.freeze({
  ok: 'bg-semaforo-verde text-texto', aviso: 'bg-semaforo-amarillo text-texto',
  excedido: 'bg-semaforo-rojo text-white', neutral: 'bg-semaforo-gris text-texto',
});
export const LIGHT_DOT = Object.freeze({ verde: 'bg-semaforo-verde', amarillo: 'bg-semaforo-amarillo', rojo: 'bg-semaforo-rojo', gris: 'bg-semaforo-gris' });
