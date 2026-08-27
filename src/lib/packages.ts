type Package = { amount: string; price: string; tag?: string }

const PACKAGES: Package[] = [
  { amount: "400", price: "R$ 19,90" },
  { amount: "800", price: "R$ 37,90", tag: "MAIS VENDIDO" },
  { amount: "1.700", price: "R$ 74,90" },
  { amount: "4.500", price: "R$ 189,90", tag: "MELHOR OFERTA" },
  { amount: "10.000", price: "R$ 399,90" },
  { amount: "22.500", price: "R$ 849,90" },
]

function parsePackageAmount(amount: string) {
  return Number(amount.replace(/\./g, ""))
}

function parsePackagePrice(price: string) {
  return Number(price.replace(/[^\d,]/g, "").replace(",", "."))
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export { PACKAGES, type Package, parsePackageAmount, parsePackagePrice, formatBRL }
