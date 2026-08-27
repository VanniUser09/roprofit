import { TestimonialMarquee, type Testimonial } from "@/components/ui/testimonial-marquee"

function initialsAvatar(name: string) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#16281f"/><text x="50%" y="50%" dy=".1em" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="30" font-weight="600" fill="#22c55e">${initials}</text></svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const REVIEWS: [name: string, username: string, text: string][] = [
  ["Lucas Andrade", "lucas.andrade", "Comprei 1.700 Robux e caiu na conta em menos de 5 minutos. Nunca vi um site tão rápido."],
  ["Marina Costa", "marina.costa", "Paguei com Pix e foi na hora. Recomendo demais, uso toda semana pros meus filhos."],
  ["Rafael Souza", "rafa.souza", "Preço bem melhor que o oficial e a entrega é imediata mesmo. Virei cliente fixo."],
  ["Beatriz Lima", "bia.lima", "Tive uma dúvida e o suporte respondeu na hora pelo Discord. Atendimento excelente."],
  ["Gabriel Torres", "gabrieltorres", "Já comprei mais de 10 vezes e nunca tive problema. Site confiável de verdade."],
  ["Juliana Alves", "ju.alves", "Paguei com cripto sem complicação nenhuma. Processo bem simples e seguro."],
]

const TESTIMONIALS: Testimonial[] = REVIEWS.map(([name, username, text]) => ({
  name,
  username,
  text,
  avatar: initialsAvatar(name),
}))

function Testimonials() {
  return (
    <section className="border-b border-border py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-xl font-bold sm:text-2xl">O que dizem nossos clientes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mais de 8 mil compras entregues com sucesso.</p>
      </div>

      <TestimonialMarquee items={TESTIMONIALS} variant="dual" />
    </section>
  )
}

export { Testimonials }
