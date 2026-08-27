import { BottomNav } from "@/components/sections/BottomNav"
import { Faq } from "@/components/sections/Faq"
import { Footer } from "@/components/sections/Footer"
import { Header } from "@/components/sections/Header"
import { Hero } from "@/components/sections/Hero"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { PaymentMethods } from "@/components/sections/PaymentMethods"
import { Stats } from "@/components/sections/Stats"
import { Testimonials } from "@/components/sections/Testimonials"

function Home() {
  return (
    <div className="min-h-svh">
      <Header />
      <main>
        <Hero />
        <Stats />
        <Testimonials />
        <HowItWorks />
        <PaymentMethods />
        <Faq />
      </main>
      <Footer />
      <BottomNav />
    </div>
  )
}

export { Home }
