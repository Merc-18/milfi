import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './routes/Home';
import Calculadora from './routes/Calculadora';
import Historial from './routes/Historial';
import FondoComun from './routes/FondoComun';
import Configuracion from './routes/Configuracion';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex justify-center bg-zinc-100 sm:p-4">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="calculadora" element={<Calculadora />} />
            <Route path="historial" element={<Historial />} />
            <Route path="fondo-comun" element={<FondoComun />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
