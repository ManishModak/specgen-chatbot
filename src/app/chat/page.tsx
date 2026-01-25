import { MessageSquare, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <MessageSquare className="w-6 h-6 text-violet-500" />
                        <span className="text-lg font-semibold text-zinc-100">SpecGen AI</span>
                    </Link>
                    <Link href="/">
                        <Button variant="ghost" size="sm">
                            <Home className="w-4 h-4" />
                            Home
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Main Chat Area */}
            <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 flex flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto mb-4">
                    {/* Welcome Message */}
                    <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl p-6">
                        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
                            👋 Welcome to SpecGen AI
                        </h2>
                        <p className="text-zinc-400 leading-relaxed">
                            I'm your AI PC building assistant. I can help you:
                        </p>
                        <ul className="mt-3 space-y-2 text-zinc-400">
                            <li>• Find the best deals from 10+ Indian retailers</li>
                            <li>• Plan custom builds based on your budget and needs</li>
                            <li>• Analyze and fix existing PC part lists</li>
                            <li>• Check compatibility and avoid bottlenecks</li>
                        </ul>
                        <p className="mt-4 text-sm text-zinc-500">
                            Try asking: "I have ₹80k, build me a gaming PC for 1080p" or "Roast my build"
                        </p>
                    </div>
                </div>

                {/* Input Area */}
                <div className="border-t border-zinc-800 pt-4">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Ask me anything about PC builds..."
                            className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        />
                        <Button size="lg" className="px-6">
                            Send
                        </Button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-2 text-center">
                        Powered by Gemini 3 Pro • Real-time pricing
                    </p>
                </div>
            </main>
        </div>
    );
}
