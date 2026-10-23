import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes.jsx';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex justify-center bg-zinc-100 sm:p-4">
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}

export default App;
