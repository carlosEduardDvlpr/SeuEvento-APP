import { Route, Routes } from 'react-router';
import { ToastProvider } from '@/components/Toast';
import { UnderConstructionPage } from '@/app/pages/UnderConstructionPage';
import { AdminLayout } from './AdminLayout';
import { DashboardPage } from './DashboardPage';
import { CalendarPage } from './calendar/CalendarPage';
import { CategoriesPage } from './catalog/CategoriesPage';
import { CombosPage } from './catalog/CombosPage';
import { GalleryPage } from './catalog/GalleryPage';
import { ItemsPage } from './catalog/ItemsPage';
import { ThemesPage } from './catalog/ThemesPage';
import { PricesPage } from './pricing/PricesPage';

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

          <Route path="itens" element={<ItemsPage />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="combos" element={<CombosPage />} />
          <Route path="temas" element={<ThemesPage />} />
          <Route path="precos" element={<PricesPage />} />
          <Route path="galeria" element={<GalleryPage />} />

          <Route path="calendario" element={<CalendarPage />} />
          <Route path="reservas" element={<UnderConstructionPage title="Reservas" />} />
          {/* O calendário e a visão geral já linkam para cá; a tela vem na T25. */}
          <Route path="reservas/:id" element={<UnderConstructionPage title="Reserva" />} />
          <Route path="clientes" element={<UnderConstructionPage title="Clientes" />} />
          <Route path="configuracoes" element={<UnderConstructionPage title="Configurações" />} />

          <Route path="*" element={<UnderConstructionPage title="Painel da chácara" />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
