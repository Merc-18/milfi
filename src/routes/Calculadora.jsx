import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator as CalcIcon, Save, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Calculadora() {
  const navigate = useNavigate();
  const config = useStore(state => state.config);
  const calcularDistribucion = useStore(state => state.calcularDistribucion);
  const agregarIngresoMensual = useStore(state => state.agregarIngresoMensual);

  const [ingresoStr, setIngresoStr] = useState('');
  const [gfStr, setGfStr] = useState(config.gf_tope.toString());
  const [resultado, setResultado] = useState(null);

  // Efecto de cálculo en vivo
  useEffect(() => {
    const ingreso = Number(ingresoStr) || 0;
    let gf = Number(gfStr) || 0;

    // Bloqueo duro visual
    if (gf > config.gf_tope) {
      gf = config.gf_tope;
    }

    if (ingreso > 0) {
      const res = calcularDistribucion(ingreso, gf);
      setResultado(res);
    } else {
      setResultado(null);
    }
  }, [ingresoStr, gfStr, config, calcularDistribucion]);

  const handleGfChange = (e) => {
    let val = e.target.value;
    if (Number(val) > config.gf_tope) {
      setGfStr(config.gf_tope.toString());
    } else {
      setGfStr(val);
    }
  };

  const guardar = () => {
    if (!resultado) return;

    const nuevo = {
      id: Date.now().toString(),
      mes: 4, // Abril simulado
      año: 2026,
      monto_ingresado: resultado.ingreso,
      gf_aplicado: resultado.gfFinal,
      ahorro_pareja: resultado.ahorro.pareja,
      snapshot: resultado,
      fecha_registro: new Date()
    };

    agregarIngresoMensual(nuevo);
    navigate('/historial');
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <header className="mb-6 mt-4 flex items-center gap-3">
        <div className="bg-principal p-2.5 rounded-[18px] text-texto shadow-sm">
          <CalcIcon size={26} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-texto tracking-tight">Calculadora</h1>
          <p className="text-texto-light text-sm font-semibold">Distribuye tu sueldo al instante</p>
        </div>
      </header>

      {/* Entradas */}
      <div className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-[24px] shadow-soft border border-transparent focus-within:border-principal focus-within:shadow-md transition-all">
          <label className="block text-xs font-bold text-texto-light uppercase tracking-widest mb-2">¿Cuánto recibiste este mes?</label>
          <div className="flex items-center text-4xl font-bold text-texto">
            <span className="mr-2 text-principal">S/</span>
            <input
              type="number"
              value={ingresoStr}
              onChange={(e) => setIngresoStr(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent outline-none placeholder:text-secundario text-texto"
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-[24px] shadow-soft border border-transparent focus-within:border-principal focus-within:shadow-md transition-all">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-texto-light uppercase tracking-widest">Gasto Fijo Aplicado</label>
            <span className="text-[10px] font-bold bg-principal/50 text-texto px-2 py-0.5 rounded-lg">Tope S/ {config.gf_tope}</span>
          </div>
          <div className="flex items-center text-2xl font-bold text-texto">
            <span className="mr-2 text-principal">S/</span>
            <input
              type="number"
              value={gfStr}
              onChange={handleGfChange}
              max={config.gf_tope}
              className="w-full bg-transparent outline-none text-texto"
            />
          </div>
          {Number(gfStr) === config.gf_tope && (
            <p className="text-xs text-principal font-bold mt-2 flex items-center gap-1">
              <AlertCircle size={12} strokeWidth={3} /> Límite alcanzado
            </p>
          )}
        </div>
      </div>

      {/* Resultados Animados */}
      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Gasto Fijo */}
            <div className="bg-principal/20 border-2 border-principal/40 rounded-[24px] p-5">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-texto text-lg flex items-center gap-2">🌸 GASTO FIJO</h3>
                <span className="font-bold text-xl">S/ {resultado.gfFinal.toLocaleString('es-PE')}</span>
              </div>
            </div>

            {/* Variables */}
            <div className="bg-acento/20 border-2 border-acento/40 rounded-[24px] p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-texto text-lg flex items-center gap-2">🍑 VARIABLES <span className="bg-white px-2 py-0.5 rounded-lg text-xs shadow-sm">{config.pct_gv}%</span></h3>
                <span className="font-bold text-xl">S/ {resultado.gv.total.toLocaleString('es-PE')}</span>
              </div>
              <div className="space-y-2.5">
                {config.subcategorias_gv.map(cat => (
                  <div key={cat.id} className="flex justify-between text-sm font-semibold text-texto/80 bg-white/50 px-3 py-2 rounded-xl">
                    <span>{cat.nombre} ({cat.porcentaje}%)</span>
                    <span className="font-bold text-texto">S/ {resultado.gv[cat.nombre.toLowerCase()]?.toLocaleString('es-PE') || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ahorro */}
            <div className="bg-exito/30 border-2 border-exito/50 rounded-[24px] p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-texto text-lg flex items-center gap-2">💚 AHORRO <span className="bg-white px-2 py-0.5 rounded-lg text-xs shadow-sm">{config.pct_ahorro}%</span></h3>
                <span className="font-bold text-xl text-green-800">S/ {resultado.ahorro.total.toLocaleString('es-PE')}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-bold text-texto px-2">
                  <span>Personal ({config.pct_ahorro_personal}%)</span>
                  <span>S/ {resultado.ahorro.personal.toLocaleString('es-PE')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-texto bg-white p-3 rounded-xl shadow-soft border border-exito/30">
                  <span className="flex items-center gap-1">Pareja ({config.pct_ahorro_pareja}%) ✨</span>
                  <span className="text-green-700 text-base">S/ {resultado.ahorro.pareja.toLocaleString('es-PE')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={guardar}
              className="w-full bg-texto text-white font-bold text-lg p-5 rounded-[20px] shadow-soft flex items-center justify-center gap-2 mt-8 hover:bg-texto-light transition-all active:scale-95"
            >
              <Save size={22} />
              Guardar este mes
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
