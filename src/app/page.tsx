import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Cpu, Sparkles, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950 relative overflow-hidden">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-10">
        {/* Header */}
        <header className="px-6 py-8">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Cpu className="w-8 h-8 text-violet-500" />
              <span className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                SpecGen
              </span>
            </div>
            <Link href="/chat">
              <Button variant="outline" size="sm">
                <MessageSquare className="w-4 h-4" />
                Try Now
              </Button>
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <main className="px-6 pt-20 pb-32">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm animate-fade-in">
              <Sparkles className="w-4 h-4" />
              Powered by Gemini 3 Pro
            </div>

            {/* Title */}
            <h1 className="text-6xl md:text-7xl font-bold leading-tight animate-fade-in">
              <span className="text-zinc-100">Your AI PC</span>
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                Building Assistant
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed animate-fade-in">
              Get real-time pricing from 10+ Indian retailers. Build smarter with AI that knows the market, not hallucinations.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4 animate-fade-in">
              <Link href="/chat">
                <Button size="lg" className="w-full sm:w-auto">
                  <MessageSquare className="w-5 h-5" />
                  Start Building
                </Button>
              </Link>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                View Pricing
              </Button>
            </div>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3 justify-center pt-8 animate-fade-in">
              {["Real-time Pricing", "10+ Retailers", "Build Analyzer", "No Hallucinations"].map((feature) => (
                <div
                  key={feature}
                  className="px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-zinc-300 text-sm backdrop-blur-sm"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Bottom Gradient Fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
