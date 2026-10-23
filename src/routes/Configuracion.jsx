import { Settings as SettingsIcon } from 'lucide-react';
import RulesContent from '../components/RulesContent.jsx';

export default function Configuracion() {
  return (
    <div className="pb-10">
      <header className="my-6 flex items-center gap-3"><SettingsIcon size={26} aria-hidden="true" /><div><h1 className="text-2xl font-bold">Configuración oficial</h1><p className="text-sm">Finanzas de Fiorella</p></div></header>
      <RulesContent />
      <p className="text-sm mt-6">La plantilla define reglas y categorías. Sus importes simulados no se incorporan al historial real.</p>
    </div>
  );
}
