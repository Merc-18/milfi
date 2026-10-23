import { useNavigate } from 'react-router-dom';
import ScenarioEditor from '../components/ScenarioEditor.jsx';

export default function Calculadora() {
  const navigate = useNavigate();
  return <ScenarioEditor onSaved={() => navigate('/fiorella/historial')} />;
}
