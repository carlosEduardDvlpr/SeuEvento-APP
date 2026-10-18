import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { Seo } from '@/features/seo/Seo';
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

/*
 * O wizard também é separado, por causa do calendário: `react-day-picker` e as
 * funções de data que ele traz pesam mais que a landing inteira, e a §18.2 cobra
 * primeiro carregamento leve no celular. A landing é a porta de entrada e não
 * precisa do calendário até alguém clicar em reservar.
 */
const BookingWizard = lazy(() =>
  import('@/features/booking/BookingWizard').then((module) => ({
    default: module.BookingWizard,
  })),
);

/*
 * A área do cliente também é separada: só quem tem sessão chega nela, e a maior
 * parte de quem abre o site nunca passa por ali.
 */
const MyBookingsPage = lazy(() =>
  import('@/features/account/MyBookingsPage').then((module) => ({
    default: module.MyBookingsPage,
  })),
);

const BookingDetailPage = lazy(() =>
  import('@/features/account/BookingDetailPage').then((module) => ({
    default: module.BookingDetailPage,
  })),
);

/**
 * Conteúdo do roteador, sem o roteador.
 *
 * Existe separado para o pré-renderizador do build (§18.3, camada 3) montar a
 * mesma árvore com `StaticRouter`, em vez de `BrowserRouter`, sem precisar de
 * uma segunda tabela de rotas — duas tabelas divergiriam na primeira rota nova,
 * e o HTML do build passaria a mostrar coisa diferente do site.
 *
 * O `StaticRouter` fica de fora deste arquivo de propósito: ele vem do módulo de
 * servidor do react-router, e importá-lo aqui o arrastaria para o bundle que o
 * celular baixa.
 */
export function AppRoutes() {
  return (
    <>
      {/*
        Fora do `Suspense` e fora das rotas: o `<head>` tem de ser atualizado
        mesmo enquanto o bundle da rota carrega, senão o título fica no da página
        anterior durante o download (§18.3).
      */}
      <Seo />

      <Suspense fallback={<p className="sr-only">Carregando…</p>}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />

            <Route path="reservar" element={<BookingWizard />} />

            <Route path="entrar" element={<LoginPage />} />
            <Route path="cadastro" element={<RegisterPage />} />
            <Route path="verificar-email" element={<VerifyEmailPage />} />
            <Route path="esqueci-senha" element={<ForgotPasswordPage />} />
            <Route path="redefinir-senha" element={<ResetPasswordPage />} />

            {/* Área do cliente: exige sessão, e volta para cá depois de entrar. */}
            <Route element={<RequireAuth />}>
              <Route path="minhas-reservas" element={<MyBookingsPage />} />
              <Route path="reservas/:id" element={<BookingDetailPage />} />
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
    </>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
