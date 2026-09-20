import { Route, Routes } from 'react-router';
import { UnderConstructionPage } from '@/app/pages/UnderConstructionPage';

/**
 * Raiz do ambiente administrativo, carregada com `React.lazy` (§12.1): o cliente
 * não baixa código de admin.
 *
 * Export default de propósito — é o que o `lazy()` espera.
 */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="*" element={<UnderConstructionPage title="Painel da chácara" />} />
    </Routes>
  );
}
