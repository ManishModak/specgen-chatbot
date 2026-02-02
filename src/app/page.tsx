import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, CpuIcon, FlameIcon, ZapIcon } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/50 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <CpuIcon className="size-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">SpecGen</span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#" className="hover:text-white transition-colors">Features</Link>
            <Link href="#" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="https://github.com/specgen/bot" className="hover:text-white transition-colors">GitHub</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-32 pb-60 text-center">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/20 blur-[120px] rounded-full opacity-30" />
          </div>

          <div className="container relative z-10 mx-auto px-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-primary backdrop-blur-md mb-8">
              <span className="flex size-2 rounded-full bg-green-500 animate-pulse" />
              Real-time Indian Prices Live
            </div>

            <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:leading-[1.1]">
              Build Your Dream PC <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">
                Without the Headache
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              The first AI-powered PC aggregator for India. Chat with an expert that knows real prices from MDComputers, Vedant, and Amazon.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/chat">
                <Button size="lg" className="h-12 rounded-full px-8 text-base shadow-lg shadow-primary/25">
                  Start Building <ArrowRightIcon className="ml-2 size-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-12 rounded-full px-8 text-base border-white/10 bg-white/5 hover:bg-white/10">
                View Gallery
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground/60">
              Powered by <span className="font-semibold text-primary">Gemini 3 API</span>
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto px-6 -mt-32 relative z-20 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <ZapIcon className="size-6 text-yellow-400" />,
                title: "Real-Time Prices",
                description: "We scrape 10+ Indian retailers every 6 hours to get you the absolute lowest price on every part."
              },
              {
                icon: <CpuIcon className="size-6 text-blue-400" />,
                title: "AI Architect",
                description: "Not just a search bar. Our AI understands 'I want to play GTA 6 at 1440p' and builds the perfect rig."
              },
              {
                icon: <FlameIcon className="size-6 text-red-400" />,
                title: "Roast My Build",
                description: "Already have a list? Paste it in. Our AI will brutally roast your bad choices and fix your bottlenecks."
              }
            ].map((feature, i) => (
              <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-sm transition-all hover:bg-white/5 hover:border-primary/50">
                <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12 text-center text-sm text-muted-foreground">
        <p>&copy; 2026 SpecGen. Built with ❤️ for the Indian Gaming Community.</p>
      </footer>
    </div>
  );
}
