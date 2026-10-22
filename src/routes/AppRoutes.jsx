import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/layout/Layout.jsx';
import Home from './Home.jsx';
import Fiorella from './Fiorella.jsx';
import Calculadora from './Calculadora.jsx';
import Historial from './Historial.jsx';
import ControlFinanzas from './ControlFinanzas.jsx';
import Configuracion from './Configuracion.jsx';
import PresupuestosGF from './PresupuestosGF.jsx';
import GastosGV from './GastosGV.jsx';
import Simulador from './Simulador.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="fiorella" element={<Fiorella />} />
        <Route path="fiorella/calculadora" element={<Calculadora />} />
        <Route path="fiorella/historial" element={<Historial />} />
        <Route path="fiorella/configuracion" element={<Configuracion />} />
        <Route path="fiorella/presupuestos" element={<PresupuestosGF />} />
        <Route path="fiorella/gastos" element={<GastosGV />} />
        <Route path="fiorella/simulador" element={<Simulador />} />
        <Route path="control" element={<ControlFinanzas />} />
        <Route path="calculadora" element={<Navigate to="/fiorella/calculadora" replace />} />
        <Route path="historial" element={<Navigate to="/fiorella/historial" replace />} />
        <Route path="configuracion" element={<Navigate to="/fiorella/configuracion" replace />} />
        <Route path="fondo-comun" element={<Navigate to="/control" replace />} />
        <Route path="*" element={<section className="my-6"><h1 className="text-2xl font-bold mb-4">Página no encontrada</h1><Link to="/" className="underline">Volver al inicio</Link></section>} />
      </Route>
    </Routes>
  );
}
