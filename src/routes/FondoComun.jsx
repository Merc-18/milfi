import { useState } from 'react';
import { useStore } from '../store/useStore';
import { PiggyBank, Receipt, TrendingUp } from 'lucide-react';

const nombresMeses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function FondoComun() {
  const [activeTab, setActiveTab] = useState('resumen');
  
  const depositos = useStore(state => state.fondoComunDepositos);
  const retiros = useStore(state => state.fondoComunRetiros);

  const totalDepositadoM = depositos.reduce((acc, dep) => acc + Number(dep.milton), 0);
  const totalDepositadoF = depositos.reduce((acc, dep) => acc + Number(dep.fiorella), 0);
  const totalDepositado = totalDepositadoM + totalDepositadoF;
  const totalRetirado = retiros.reduce((acc, ret) => acc + Number(ret.monto), 0);
  const saldoFondoComun = totalDepositadoF - totalRetirado; // Saldo de Fiorella menos retiros

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <header className="mb-6 mt-4 flex items-center gap-3">
        <div className="bg-secundario p-2.5 rounded-[18px] text-texto shadow-sm">
          <PiggyBank size={26} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-texto tracking-tight">Fondo M&F</h1>
          <p className="text-texto-light text-sm font-semibold">Nuestro dinero juntos</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 rounded-[20px] shadow-soft mb-6">
        <button 
          onClick={() => setActiveTab('resumen')}
          className={`flex-1 py-2 text-sm font-bold rounded-[16px] transition-colors ${activeTab === 'resumen' ? 'bg-secundario text-texto' : 'text-texto-light'}`}
        >
          Resumen
        </button>
        <button 
          onClick={() => setActiveTab('depositos')}
          className={`flex-1 py-2 text-sm font-bold rounded-[16px] transition-colors ${activeTab === 'depositos' ? 'bg-secundario text-texto' : 'text-texto-light'}`}
        >
          Depósitos
        </button>
        <button 
          onClick={() => setActiveTab('retiros')}
          className={`flex-1 py-2 text-sm font-bold rounded-[16px] transition-colors ${activeTab === 'retiros' ? 'bg-secundario text-texto' : 'text-texto-light'}`}
        >
          Retiros
        </button>
      </div>

      {activeTab === 'resumen' && (
        <div className="space-y-4 animate-in slide-in-from-right-4">
          <div className="bg-white p-6 rounded-[24px] shadow-soft text-center border-2 border-secundario/30 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-32 h-32 bg-secundario rounded-br-full opacity-20 -z-0" />
             <div className="relative z-10">
                <p className="text-sm font-bold text-texto-light uppercase tracking-widest mb-1">Saldo Disponible (Fiorella)</p>
                <p className="text-5xl font-bold text-texto mb-2 tracking-tighter">S/ {saldoFondoComun.toLocaleString('es-PE', {minimumFractionDigits: 2})}</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-[24px] shadow-soft">
              <p className="text-xs font-bold text-texto-light uppercase mb-1">Milton Aportó</p>
              <p className="text-xl font-bold text-texto">S/ {totalDepositadoM.toLocaleString('es-PE')}</p>
            </div>
            <div className="bg-white p-5 rounded-[24px] shadow-soft">
              <p className="text-xs font-bold text-texto-light uppercase mb-1">Fiorella Aportó</p>
              <p className="text-xl font-bold text-texto">S/ {totalDepositadoF.toLocaleString('es-PE')}</p>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-[24px] shadow-soft flex justify-between items-center border border-fondo">
            <div>
               <p className="text-xs font-bold text-texto-light uppercase mb-1">Total Retirado</p>
               <p className="text-xl font-bold text-texto">S/ {totalRetirado.toLocaleString('es-PE')}</p>
            </div>
            <div className="bg-fondo p-3 rounded-full text-texto-light"><TrendingUp size={24} /></div>
          </div>
        </div>
      )}

      {activeTab === 'depositos' && (
        <div className="bg-white rounded-[24px] shadow-soft overflow-hidden animate-in slide-in-from-right-4">
          <table className="w-full text-sm text-left">
            <thead className="bg-secundario/30 text-texto uppercase font-bold text-xs">
              <tr>
                <th className="px-4 py-4">Mes</th>
                <th className="px-4 py-4 text-center">Milton</th>
                <th className="px-4 py-4 text-center">Fiorella</th>
                <th className="px-4 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {depositos.map((dep, i) => (
                <tr key={dep.id} className={`border-b border-fondo ${i % 2 === 0 ? 'bg-white' : 'bg-fondo/30'}`}>
                  <td className="px-4 py-4 font-bold text-texto whitespace-nowrap">
                    {nombresMeses[dep.mes]} {dep.año.toString().slice(2)}
                  </td>
                  <td className="px-4 py-4 text-center font-medium">
                    {dep.milton > 0 ? dep.milton : '-'}
                  </td>
                  <td className="px-4 py-4 text-center font-medium">
                    {dep.fiorella > 0 ? dep.fiorella : '-'}
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-texto bg-secundario/10">
                    {dep.milton + dep.fiorella}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-center text-texto-light p-4 bg-fondo/50">Toca una celda para editar (Sprint 1)</p>
        </div>
      )}

      {activeTab === 'retiros' && (
        <div className="space-y-3 animate-in slide-in-from-right-4">
          {retiros.map(ret => (
            <div key={ret.id} className="bg-white p-5 rounded-[24px] shadow-soft flex justify-between items-center border border-transparent hover:border-secundario transition-colors">
              <div className="flex gap-4 items-center">
                 <div className="bg-fondo w-12 h-12 rounded-[16px] flex items-center justify-center text-texto-light">
                   <Receipt size={24} strokeWidth={2} />
                 </div>
                 <div>
                   <p className="font-bold text-texto">{ret.descripcion}</p>
                   <div className="flex items-center gap-2 mt-1">
                     <span className="text-xs font-bold bg-secundario/30 text-texto px-2 py-0.5 rounded-md">{ret.categoria}</span>
                     <span className="text-[10px] text-texto-light font-semibold">{ret.fecha}</span>
                   </div>
                 </div>
              </div>
              <p className="font-bold text-lg text-texto">-S/ {ret.monto}</p>
            </div>
          ))}
          <button className="w-full border-2 border-dashed border-secundario text-texto font-bold p-4 rounded-[20px] mt-4 hover:bg-secundario/10 transition-colors">
            + Nuevo Retiro
          </button>
        </div>
      )}
    </div>
  );
}
