import { create } from 'zustand';

// Datos mock base para iniciar la app
const initialState = {
  ingresosMensuales: [
    {
      id: 'mock-1',
      mes: 4, // Abril
      año: 2026,
      monto_ingresado: 4000,
      gf_aplicado: 1500,
      ahorro_pareja: 600,
      snapshot: {
        ingreso: 4000,
        gfFinal: 1500,
        sobrante: 2500,
        gv: { total: 1000, salud: 500, gustos: 400, ropa: 100 },
        ahorro: { total: 1500, personal: 900, pareja: 600 }
      },
      fecha_registro: new Date('2026-04-01T10:00:00')
    },
    {
      id: 'mock-2',
      mes: 3, // Marzo
      año: 2026,
      monto_ingresado: 5000,
      gf_aplicado: 1500,
      ahorro_pareja: 840,
      snapshot: {
        ingreso: 5000,
        gfFinal: 1500,
        sobrante: 3500,
        gv: { total: 1400, salud: 700, gustos: 560, ropa: 140 },
        ahorro: { total: 2100, personal: 1260, pareja: 840 }
      },
      fecha_registro: new Date('2026-03-01T10:00:00')
    },
    {
      id: 'mock-3',
      mes: 2, // Febrero
      año: 2026,
      monto_ingresado: 3000,
      gf_aplicado: 1500,
      ahorro_pareja: 360,
      snapshot: {
        ingreso: 3000,
        gfFinal: 1500,
        sobrante: 1500,
        gv: { total: 600, salud: 300, gustos: 240, ropa: 60 },
        ahorro: { total: 900, personal: 540, pareja: 360 }
      },
      fecha_registro: new Date('2026-02-01T10:00:00')
    }
  ],
  fondoComunDepositos: [
    { id: 'fc-1', mes: 11, año: 2025, milton: 700, fiorella: 0 },
    { id: 'fc-2', mes: 12, año: 2025, milton: 700, fiorella: 300 },
    { id: 'fc-3', mes: 1, año: 2026, milton: 700, fiorella: 300 },
    { id: 'fc-4', mes: 2, año: 2026, milton: 1200, fiorella: 400 },
    { id: 'fc-5', mes: 3, año: 2026, milton: 700, fiorella: 300 },
    { id: 'fc-6', mes: 4, año: 2026, milton: 0, fiorella: 308 },
  ],
  fondoComunRetiros: [
    { id: 'ret-1', fecha: '2026-01-15', categoria: 'Viajes', descripcion: 'Pasaje Cajamarca ida', monto: 360 },
    { id: 'ret-2', fecha: '2026-02-10', categoria: 'Conciertos', descripcion: 'Concierto Grupo 5', monto: 108 },
    { id: 'ret-3', fecha: '2026-02-22', categoria: 'Viajes', descripcion: 'Pasaje Cajamarca vuelta', monto: 240 },
  ],
  config: {
    gf_tope: 1500,
    pct_gv: 40,
    pct_ahorro: 60,
    pct_ahorro_personal: 60,
    pct_ahorro_pareja: 40,
    subcategorias_gv: [
      { id: 'gv-1', nombre: 'Salud', porcentaje: 50 },
      { id: 'gv-2', nombre: 'Gustos', porcentaje: 40 },
      { id: 'gv-3', nombre: 'Ropa', porcentaje: 10 },
    ],
    subcategorias_gf: []
  }
};

export const useStore = create((set, get) => ({
  ...initialState,

  agregarIngresoMensual: (nuevoIngreso) => set((state) => {
    // Si ya existe el mes, lo sobreescribimos
    const existe = state.ingresosMensuales.findIndex(
      (i) => i.mes === nuevoIngreso.mes && i.año === nuevoIngreso.año
    );
    let nuevaLista = [...state.ingresosMensuales];
    
    if (existe >= 0) {
      nuevaLista[existe] = nuevoIngreso;
    } else {
      nuevaLista = [nuevoIngreso, ...nuevaLista];
    }
    
    // Ordenar descendente
    nuevaLista.sort((a, b) => {
      if (a.año !== b.año) return b.año - a.año;
      return b.mes - a.mes;
    });
    
    return { ingresosMensuales: nuevaLista };
  }),

  calcularDistribucion: (ingreso, gf_aplicado) => {
    const { config } = get();
    
    const gfFinal = Math.min(Number(gf_aplicado), config.gf_tope);
    const sobrante = Number(ingreso) - gfFinal;
    if (sobrante <= 0) return null;

    const gv_total = (sobrante * config.pct_gv) / 100;
    const ahorro_total = (sobrante * config.pct_ahorro) / 100;
    
    const ahorro_personal = (ahorro_total * config.pct_ahorro_personal) / 100;
    const ahorro_pareja = (ahorro_total * config.pct_ahorro_pareja) / 100;

    const desglose_gv = config.subcategorias_gv.reduce((acc, cat) => {
      acc[cat.nombre.toLowerCase()] = (gv_total * cat.porcentaje) / 100;
      return acc;
    }, {});

    return {
      ingreso: Number(ingreso),
      gfFinal,
      sobrante,
      gv: { total: gv_total, ...desglose_gv },
      ahorro: { total: ahorro_total, personal: ahorro_personal, pareja: ahorro_pareja }
    };
  }
}));
