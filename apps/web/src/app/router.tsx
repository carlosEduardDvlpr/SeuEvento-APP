import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UnderConstructionPage } from './pages/UnderConstructionPage';
import { PublicLayout } from './layout/PublicLayout';

/**
 * Mapa de rotas da §12.1.
 *
 * O bundle do admin entra por `lazy()`, então quem só quer reservar não baixa
 * código de painel. As rotas ainda não construídas resolvem numa página que
 * explica a situação, em vez de cair num 404.
 */
const AdminRoutes = lazy(() => import('@/features/admin/AdminRoutes'));

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p className="sr-only">Carregando…</p>}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />

            <Route path="reservar" element={<UnderConstructionPage title="Reservar" />} />

            <Route path="entrar" element={<UnderConstructionPage title="Entrar" />} />
            <Route path="cadastro" element={<UnderConstructionPage title="Criar conta" />} />
            <Route
              path="verificar-email"
              element={<UnderConstructionPage title="Confirmar e-mail" />}
            />
            <Route
              path="esqueci-senha"
              element={<UnderConstructionPage title="Esqueci minha senha" />}
            />
            <Route
              path="redefinir-senha"
              element={<UnderConstructionPage title="Definir nova senha" />}
            />

            <Route
              path="minhas-reservas"
              element={<UnderConstructionPage title="Minhas reservas" />}
            />
            <Route path="reservas/:id" element={<UnderConstructionPage title="Reserva" />} />

            <Route path="termos" element={<UnderConstructionPage title="Termos de uso" />} />
            <Route
              path="privacidade"
              element={<UnderConstructionPage title="Política de privacidade" />}
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
