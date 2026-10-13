import { Route, Routes } from 'react-router';
import { ToastProvider } from '@/components/Toast';
import { UnderConstructionPage } from '@/app/pages/UnderConstructionPage';
import { AdminLayout } from './AdminLayout';
import { DashboardPage } from './DashboardPage';
import { CategoriesPage } from './catalog/CategoriesPage';
import { GalleryPage } from './catalog/GalleryPage';
import { ThemesPage } from './catalog/ThemesPage';

/**
 * Raiz do ambiente administrativo, carregada com `React.lazy` (§12.1): o cliente
 * não baixa código de painel.
 *
 * O `ToastProvider` entra aqui, e não nos providers globais, porque só o painel
 * usa aviso de ação concluída — a área do cliente mostra retorno na própria tela.
 *
 * Export default de propósito — é o que o `lazy()` espera.
 */
export default function AdminRoutes() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="itens" element={<UnderConstructionPage title="Itens" />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="combos" element={<UnderConstructionPage title="Combos" />} />
          <Route path="temas" element={<ThemesPage />} />
          <Route path="precos" element={<UnderConstructionPage title="Preços" />} />
          <Route path="galeria" element={<GalleryPage />} />

          <Route path="calendario" element={<UnderConstructionPage title="Calendário" />} />
          <Route path="reservas" element={<UnderConstructionPage title="Reservas" />} />
          <Route path="clientes" element={<UnderConstructionPage title="Clientes" />} />
          <Route path="configuracoes" element={<UnderConstructionPage title="Configurações" />} />

          <Route path="*" element={<UnderConstructionPage title="Painel da chácara" />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
