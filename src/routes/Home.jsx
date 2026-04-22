import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { History, Sparkles, ChevronRight, Plus } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const ingresos = useStore(state => state.ingresosMensuales);
  const depositos = useStore(state => state.fondoComunDepositos);
  const retiros = useStore(state => state.fondoComunRetiros);
  
  const currentMonth = "Abril 2026";
  const ultimoIngreso = ingresos.length > 0 ? ingresos[0] : null;

  const totalDepositado = depositos.reduce((acc, dep) => acc + Number(dep.fiorella), 0); // Solo aportes de Fiorella
  const totalRetirado = retiros.reduce((acc, ret) => acc + Number(ret.monto), 0);
  const saldoFondoComun = totalDepositado - totalRetirado;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <header className="mb-8 mt-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-texto tracking-tight mb-1 flex items-center gap-2">
            Hola Fiorella 🌸
          </h1>
          <p className="text-texto-light font-medium">Lista para organizar el mes?</p>
        </div>
        <img src="/logo.png" alt="Mascota Gua Gua Gua" className="w-14 h-14 object-cover rounded-[18px] shadow-soft border-2 border-principal" />
      </header>

      <div className="space-y-5">
        {/* Card Resumen Mes Actual */}
        <div 
          onClick={() => navigate('/calculadora')}
          className="bg-white p-6 rounded-[24px] shadow-soft border-2 border-transparent hover:border-principal cursor-pointer transition-all relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-principal rounded-bl-full opacity-30 group-hover:scale-110 transition-transform -z-0" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-sm font-bold text-texto-light uppercase tracking-widest">{currentMonth}</h2>
            </div>
            {ultimoIngreso ? (
              <>
                <p className="text-3xl font-bold text-texto mb-3">
                  S/ {ultimoIngreso.monto_ingresado.toLocaleString('es-PE', {minimumFractionDigits: 2})}
                </p>
                <div className="inline-flex items-center gap-1.5 bg-exito text-texto px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
                  <span>Ahorro Pareja: S/ {ultimoIngreso.ahorro_pareja.toLocaleString('es-PE')}</span>
                  <span>💚</span>
                </div>
              </>
            ) : (
              <p className="text-xl font-bold text-texto mb-3">Aún no registraste este mes</p>
            )}
            
            <div className="mt-5 text-texto flex items-center font-bold text-sm bg-fondo/50 py-2 px-4 rounded-xl w-fit group-hover:bg-principal transition-colors">
              {ultimoIngreso ? 'Ver desglose' : 'Registrar ingreso'} <ChevronRight size={18} className="ml-1" />
            </div>
          </div>
        </div>

        {/* Card Fondo Común */}
        <div 
          onClick={() => navigate('/fondo-comun')}
          className="bg-secundario/30 p-6 rounded-[24px] shadow-soft cursor-pointer hover:shadow-md transition-all group"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl drop-shadow-sm">💜</span>
              <h2 className="text-lg font-bold text-texto">Fondo M&F</h2>
            </div>
          </div>
          <p className="text-4xl font-bold text-texto mb-3 tracking-tight">
            S/ {saldoFondoComun.toLocaleString('es-PE', {minimumFractionDigits: 2})}
          </p>
          <p className="text-sm font-semibold text-texto-light flex items-center gap-1 opacity-80">
            Último retiro: {retiros.length > 0 ? retiros[0].fecha : 'N/A'}
          </p>
          <div className="mt-4 text-texto flex items-center font-bold text-sm">
            Ver detalle <ChevronRight size={18} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Botones de acción rápida */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <button 
            onClick={() => navigate('/historial')}
            className="flex flex-col items-center justify-center gap-3 bg-white p-5 rounded-[20px] shadow-soft hover:shadow-md hover:-translate-y-1 transition-all border border-transparent hover:border-secundario"
          >
            <div className="bg-secundario/40 p-3 rounded-2xl">
              <History className="text-texto" size={26} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-texto">Historial</span>
          </button>
          <button 
            className="flex flex-col items-center justify-center gap-3 bg-white p-5 rounded-[20px] shadow-soft opacity-60 cursor-not-allowed"
          >
            <div className="bg-fondo p-3 rounded-2xl grayscale">
              <Sparkles className="text-texto-light" size={26} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-texto-light flex flex-col">
              Simulador
              <span className="text-[10px] font-semibold text-principal drop-shadow-sm uppercase tracking-wider mt-1 bg-texto text-white px-2 py-0.5 rounded-full">Próximamente</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
