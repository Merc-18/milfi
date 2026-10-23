import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/layout/Layout.jsx';
import Home from './Home.jsx';
import Fiorella from './Fiorella.jsx';
import Historial from './Historial.jsx';
import ControlFinanzas from './ControlFinanzas.jsx';
import Acceso from './Acceso.jsx';
import Configuracion from './Configuracion.jsx';
import GastosGV from './GastosGV.jsx';
import Metas from './Metas.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="fiorella" element={<Fiorella />} />
        <Route path="fiorella/metas" element={<Metas />} />
        <Route path="fiorella/calculadora" element={<Navigate to="/fiorella/metas?simular" replace />} />
        <Route path="fiorella/historial" element={<Historial />} />
        <Route path="fiorella/configuracion" element={<Configuracion />} />
        <Route path="fiorella/presupuestos" element={<Navigate to="/fiorella/gastos?tipo=fijos" replace />} />
        <Route path="fiorella/gastos" element={<GastosGV />} />
        <Route path="fiorella/simulador" element={<Navigate to="/fiorella/metas" replace />} />
        <Route path="acceso" element={<Acceso />} />
        <Route path="control" element={<ControlFinanzas />} />
        <Route path="calculadora" element={<Navigate to="/fiorella/metas?simular" replace />} />
        <Route path="historial" element={<Navigate to="/fiorella/historial" replace />} />
        <Route path="configuracion" element={<Navigate to="/fiorella/configuracion" replace />} />
        <Route path="fondo-comun" element={<Navigate to="/control" replace />} />
        <Route path="*" element={<section className="my-6"><h1 className="text-2xl font-bold mb-4">Página no encontrada</h1><Link to="/" className="underline">Volver al inicio</Link></section>} />
      </Route>
    </Routes>
  );
}
