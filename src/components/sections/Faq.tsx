import { FaqPro, type FaqProItem } from "@/components/ui/faq-pro"

const FAQ_ITEMS: FaqProItem[] = [
  {
    id: "entrega",
    question: "Em quanto tempo recebo meu Robux?",
    answer:
      "A entrega é imediata após a aprovação do pagamento. Com Pix, o Robux costuma cair na sua conta em poucos minutos.",
  },
  {
    id: "seguranca",
    question: "É seguro comprar Robux na RoProfit?",
    answer:
      "Sim. Todos os pagamentos são processados por parceiros certificados e seus dados são protegidos com criptografia de ponta a ponta.",
  },
  {
    id: "pagamento",
    question: "Quais formas de pagamento vocês aceitam?",
    answer:
      "Aceitamos Pix e criptomoedas (BTC, ETH e USDT).",
  },
  {
    id: "conta",
    question: "Preciso passar a senha da minha conta Roblox?",
    answer:
      "Não. Nunca pedimos sua senha. Basta informar seu nome de usuário do Roblox e o Robux é entregue diretamente na sua conta.",
  },
  {
    id: "reembolso",
    question: "Posso pedir reembolso se algo der errado?",
    answer:
      "Sim. Caso o Robux não seja entregue por algum problema técnico, reembolsamos 100% do valor pago em até 24 horas.",
  },
  {
    id: "suporte",
    question: "Como falo com o suporte?",
    answer:
      "Nosso suporte está disponível pelo Discord e redes sociais, com atendimento rápido todos os dias da semana.",
  },
]

function Faq() {
  return (
    <section id="faq" className="border-b border-border px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-xl font-bold sm:text-2xl">Perguntas frequentes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo o que você precisa saber antes de comprar.
        </p>

        <div className="mt-8">
          <FaqPro
            defaultOpenFirst
            items={FAQ_ITEMS}
            searchPlaceholder="Buscar na FAQ..."
          />
        </div>
      </div>
    </section>
  )
}

export { Faq }
