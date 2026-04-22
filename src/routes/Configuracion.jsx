import { useStore } from '../store/useStore';
import { Settings as SettingsIcon, Info } from 'lucide-react';

export default function Configuracion() {
  const config = useStore(state => state.config);

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <header className="mb-6 mt-4 flex items-center gap-3">
        <div className="bg-texto text-fondo p-2.5 rounded-[18px] shadow-sm">
          <SettingsIcon size={26} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-texto tracking-tight">Configuración</h1>
          <p className="text-texto-light text-sm font-semibold">Reglas del juego</p>
        </div>
      </header>

      <div className="space-y-6">
        
        {/* Estructura (Lectura) */}
        <section className="bg-white p-6 rounded-[24px] shadow-soft border-2 border-fondo">
          <h2 className="font-bold text-texto text-lg mb-4 flex items-center gap-2">
            Estructura Fija
            <Info size={16} className="text-texto-light" />
          </h2>
          
          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-center pb-3 border-b border-fondo">
              <span className="font-semibold text-texto-light">Gasto Fijo (Tope)</span>
              <span className="font-bold text-texto bg-principal/30 px-3 py-1 rounded-lg">S/ {config.gf_tope}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-fondo">
              <span className="font-semibold text-texto-light">Gastos Variables</span>
              <span className="font-bold text-texto bg-acento/30 px-3 py-1 rounded-lg">{config.pct_gv}% del sobrante</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-fondo">
              <span className="font-semibold text-texto-light">Ahorro Total</span>
              <span className="font-bold text-texto bg-exito/30 px-3 py-1 rounded-lg">{config.pct_ahorro}% del sobrante</span>
            </div>
            <div className="bg-fondo p-3 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-texto-light text-xs uppercase tracking-widest">Ahorro Personal</span>
                <span className="font-bold text-texto text-xs">{config.pct_ahorro_personal}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium text-texto-light text-xs uppercase tracking-widest">Ahorro Pareja</span>
                <span className="font-bold text-texto text-xs">{config.pct_ahorro_pareja}%</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-center text-texto-light mt-4 font-semibold uppercase tracking-wider">Estos porcentajes son inmutables por diseño</p>
        </section>

        {/* Subcategorias GV */}
        <section className="bg-white p-6 rounded-[24px] shadow-soft">
          <div className="flex justify-between items-center mb-4">
             <h2 className="font-bold text-texto text-lg">Subcategorías GV</h2>
             <span className="text-xs font-bold bg-acento/40 px-2 py-1 rounded-md text-texto">Suma: 100%</span>
          </div>
          
          <div className="space-y-3">
            {config.subcategorias_gv.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={cat.nombre} 
                  readOnly
                  className="bg-fondo px-4 py-2.5 rounded-[14px] flex-1 font-semibold text-texto outline-none"
                />
                <div className="bg-fondo px-4 py-2.5 rounded-[14px] w-20 flex items-center justify-center font-bold text-texto">
                  {cat.porcentaje}%
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full text-sm font-bold text-texto border-2 border-dashed border-fondo py-3 rounded-[16px] mt-4 hover:bg-fondo transition-colors">
            + Agregar Subcategoría (Sprint 1)
          </button>
        </section>

      </div>
    </div>
  );
}
