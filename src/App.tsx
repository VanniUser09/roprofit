import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { ErrorScreen } from "@/components/ErrorScreen"
import { LoadingScreen } from "@/components/LoadingScreen"
import { RequireAdmin } from "@/components/RequireAdmin"
import { RequireAuth } from "@/components/RequireAuth"
import { Calculator } from "@/pages/Calculator"
import { Checkout } from "@/pages/Checkout"
import { Home } from "@/pages/Home"
import { Login } from "@/pages/Login"

// O módulo administrativo carrega sob demanda: ele traz gráficos e tabelas que
// não têm por que pesar no bundle de quem só abre a landing.
const AdminLayout = lazy(() =>
  import("@/components/admin/AdminLayout").then((m) => ({ default: m.AdminLayout }))
)
const MarketOverview = lazy(() =>
  import("@/pages/admin/MarketOverview").then((m) => ({ default: m.MarketOverview }))
)
const Ranking = lazy(() => import("@/pages/admin/Ranking").then((m) => ({ default: m.Ranking })))
const Opportunities = lazy(() =>
  import("@/pages/admin/Opportunities").then((m) => ({ default: m.Opportunities }))
)
const ItemDetail = lazy(() =>
  import("@/pages/admin/ItemDetail").then((m) => ({ default: m.ItemDetail }))
)
const BatchBuilder = lazy(() =>
  import("@/pages/admin/BatchBuilder").then((m) => ({ default: m.BatchBuilder }))
)
const Simulator = lazy(() =>
  import("@/pages/admin/Simulator").then((m) => ({ default: m.Simulator }))
)
const Alerts = lazy(() => import("@/pages/admin/Alerts").then((m) => ({ default: m.Alerts })))
const Collectors = lazy(() =>
  import("@/pages/admin/Collectors").then((m) => ({ default: m.Collectors }))
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/entrar" element={<Login />} />
        <Route
          path="/comprar"
          element={
            <RequireAuth>
              <Calculator />
            </RequireAuth>
          }
        />
        <Route
          path="/checkout"
          element={
            <RequireAuth>
              <Checkout />
            </RequireAuth>
          }
        />
        {/* Market Intelligence — só para administradores. A guarda de cliente
            aqui é conveniência; a barreira real é o requireAdmin do backend. */}
        <Route
          path="/admin/mercado"
          element={
            <RequireAdmin>
              <Suspense fallback={<LoadingScreen label="Carregando painel..." />}>
                <AdminLayout />
              </Suspense>
            </RequireAdmin>
          }
        >
          <Route index element={<MarketOverview />} />
          <Route path="ranking" element={<Ranking />} />
          <Route path="oportunidades" element={<Opportunities />} />
          <Route path="item/:assetId" element={<ItemDetail />} />
          <Route path="lotes" element={<BatchBuilder />} />
          <Route path="simulador" element={<Simulator />} />
          <Route path="alertas" element={<Alerts />} />
          <Route path="coletores" element={<Collectors />} />
        </Route>

        {/* Preview das telas de estado. Some no build de produção. */}
        {import.meta.env.DEV && <Route path="/_loading" element={<LoadingScreen />} />}
        {import.meta.env.DEV && (
          <Route path="/_erro" element={<ErrorScreen error={new Error("Erro de exemplo para preview")} />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
