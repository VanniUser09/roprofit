import { BrowserRouter, Route, Routes } from "react-router-dom"

import { ErrorScreen } from "@/components/ErrorScreen"
import { LoadingScreen } from "@/components/LoadingScreen"
import { RequireAuth } from "@/components/RequireAuth"
import { Calculator } from "@/pages/Calculator"
import { Checkout } from "@/pages/Checkout"
import { Home } from "@/pages/Home"
import { Login } from "@/pages/Login"

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
