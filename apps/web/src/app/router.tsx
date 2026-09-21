import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { RequireAuth, RequireRole } from './guards';
import { PublicLayout } from './layout/PublicLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { UnderConstructionPage } from './pages/UnderConstructionPage';

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

            <Route path="entrar" element={<LoginPage />} />
            <Route path="cadastro" element={<RegisterPage />} />
            <Route path="verificar-email" element={<VerifyEmailPage />} />
            <Route path="esqueci-senha" element={<ForgotPasswordPage />} />
            <Route path="redefinir-senha" element={<ResetPasswordPage />} />

            {/* Área do cliente: exige sessão, e volta para cá depois de entrar. */}
            <Route element={<RequireAuth />}>
              <Route
                path="minhas-reservas"
                element={<UnderConstructionPage title="Minhas reservas" />}
              />
              <Route path="reservas/:id" element={<UnderConstructionPage title="Reserva" />} />
            </Route>

            <Route path="termos" element={<UnderConstructionPage title="Termos de uso" />} />
            <Route
              path="privacidade"
              element={<UnderConstructionPage title="Política de privacidade" />}
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route element={<RequireRole role="ADMIN" />}>
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
