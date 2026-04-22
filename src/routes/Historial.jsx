import { useStore } from '../store/useStore';
import { Calendar, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const nombresMeses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function Historial() {
  const ingresos = useStore(state => state.ingresosMensuales);
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <header className="mb-6 mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-texto">Historial</h1>
          <p className="text-texto-light text-sm font-semibold">Tus registros pasados</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl shadow-soft font-bold text-texto flex items-center gap-2">
          <Calendar size={18} /> 2026
        </div>
      </header>

      <div className="space-y-4">
        {ingresos.length === 0 ? (
          <p className="text-center text-texto-light mt-10 font-medium">No hay registros aún.</p>
        ) : (
          ingresos.map((ingreso) => (
            <div key={ingreso.id} className="bg-white rounded-[24px] shadow-soft overflow-hidden border border-transparent hover:border-secundario transition-colors">
              <div 
                onClick={() => toggleExpand(ingreso.id)}
                className="p-5 flex justify-between items-center cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-secundario/30 w-14 h-14 rounded-[18px] flex flex-col items-center justify-center text-texto">
                    <span className="text-sm font-bold leading-none">{nombresMeses[ingreso.mes]}</span>
                    <span className="text-[10px] font-bold opacity-70 mt-1">{ingreso.año}</span>
                  </div>
                  <div>
                    <p className="font-bold text-xl text-texto leading-none mb-1.5">S/ {ingreso.monto_ingresado.toLocaleString('es-PE')}</p>
                    <p className="text-xs font-bold text-green-800 bg-exito/50 px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1">
                      Pareja S/ {ingreso.ahorro_pareja.toLocaleString('es-PE')} 💚
                    </p>
                  </div>
                </div>
                <div className="bg-fondo p-2 rounded-full">
                   <ChevronDown size={20} strokeWidth={3} className={`text-texto-light transition-transform ${expandedId === ingreso.id ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Detalle Expandible */}
              {expandedId === ingreso.id && (
                <div className="px-5 pb-6 pt-3 border-t border-fondo bg-fondo/30 text-sm animate-in slide-in-from-top-2">
                  <div className="space-y-3 mt-1">
                    <div className="flex justify-between text-texto bg-principal/20 p-2.5 rounded-xl font-bold">
                      <span>🌸 Gasto Fijo</span>
                      <span>S/ {ingreso.snapshot.gfFinal.toLocaleString('es-PE')}</span>
                    </div>
                    
                    <div className="bg-acento/10 p-2.5 rounded-xl border border-acento/20">
                      <div className="flex justify-between text-texto font-bold mb-2">
                        <span>🍑 Variables</span>
                        <span>S/ {ingreso.snapshot.gv.total.toLocaleString('es-PE')}</span>
                      </div>
                      <div className="pl-3 space-y-1.5 text-xs font-semibold text-texto-light border-l-2 border-acento ml-1">
                         <div className="flex justify-between"><span>Salud</span><span>S/ {ingreso.snapshot.gv.salud?.toLocaleString('es-PE')}</span></div>
                         <div className="flex justify-between"><span>Gustos</span><span>S/ {ingreso.snapshot.gv.gustos?.toLocaleString('es-PE')}</span></div>
                         <div className="flex justify-between"><span>Ropa</span><span>S/ {ingreso.snapshot.gv.ropa?.toLocaleString('es-PE')}</span></div>
                      </div>
                    </div>

                    <div className="bg-exito/10 p-2.5 rounded-xl border border-exito/20">
                       <div className="flex justify-between text-texto font-bold mb-2">
                          <span>💚 Ahorro Total</span>
                          <span>S/ {ingreso.snapshot.ahorro.total.toLocaleString('es-PE')}</span>
                       </div>
                       <div className="pl-3 space-y-1.5 text-xs font-semibold text-texto-light border-l-2 border-exito ml-1">
                         <div className="flex justify-between"><span>Personal</span><span>S/ {ingreso.snapshot.ahorro.personal.toLocaleString('es-PE')}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
