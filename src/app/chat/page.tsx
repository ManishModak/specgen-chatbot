"use client";

import { useChat } from "@ai-sdk/react";
import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
    Message,
    MessageContent,
    MessageResponse,
} from "@/components/ai-elements/message";
import {
    PromptInput,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Loader } from "@/components/ai-elements/loader";
import { MessageSquareIcon, ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { ProductCard } from "@/components/product-card";
import { Product } from "@/lib/products";

export default function ChatPage() {
    const [inputValue, setInputValue] = useState("");
    const [mode, setMode] = useState<"build" | "roast">("build");

    const { messages, sendMessage, status, stop, setMessages } = useChat({
        api: "/api/chat",
        body: { mode }, // Send current mode to backend
        onFinish: (message) => {
            // Handle any client-side logic after message completion
        }
    });

    const isLoading = status === "streaming" || status === "submitted";

    const handleSubmit = async (msg: { text: string }) => {
        if (!msg.text.trim()) return;
        setInputValue("");
        await sendMessage({ content: msg.text, role: "user" });
    };

    // Helper to get text content from message parts
    const getMessageText = (message: typeof messages[0]) => {
        if (message.parts) {
            return message.parts
                .filter((part): part is { type: "text"; text: string } => part.type === "text")
                .map((part) => part.text)
                .join("");
        }
        return message.content;
    };

    // Helper to identify if a message contains tool invocations (products)
    // For now, we'll look for tool invocations if we implement them, 
    // or checks validation results.
    const renderMessageContent = (message: typeof messages[0]) => {
        // If we have tool invocations (future proofing)
        if (message.toolInvocations?.length) {
            return (
                <div className="space-y-4">
                    {message.toolInvocations.map((toolInvocation) => {
                        if (toolInvocation.toolName === 'show_products' && toolInvocation.state === 'result') {
                            const products = toolInvocation.result as Product[];
                            return (
                                <div key={toolInvocation.toolCallId} className="grid gap-4 sm:grid-cols-2">
                                    {products.map(p => <ProductCard key={p.id} product={p} />)}
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            );
        }

        // Default text rendering
        const text = getMessageText(message);
        return message.role === "user" ? (
            <p className="whitespace-pre-wrap">{text}</p>
        ) : (
            <MessageResponse>{text}</MessageResponse>
        );
    };

    return (
        <div className="flex h-screen flex-col bg-background selection:bg-primary/20">
            {/* Header */}
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center gap-3">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="size-8">
                            <ArrowLeftIcon className="size-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                            <MessageSquareIcon className="size-4 text-primary" />
                        </div>
                        <h1 className="text-base font-semibold tracking-tight">SpecGen Chat</h1>
                    </div>
                </div>

                <ModeToggle mode={mode} onModeChange={setMode} />
            </header>

            {/* Conversation Area */}
            <Conversation className="flex-1">
                <ConversationContent className="mx-auto max-w-3xl pb-32">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12">
                            <ConversationEmptyState
                                title={mode === "build" ? "PC Architect" : "🔥 Roast Master"}
                                description={
                                    mode === "build"
                                        ? "Tell me your budget and what games you play (e.g. '₹80k for GTA 6')"
                                        : "Paste your build specs below. I'll tear it apart."
                                }
                                icon={<MessageSquareIcon className="size-12 opacity-50" />}
                            />

                            {/* Example Prompts */}
                            <div className="mt-8 w-full max-w-xl px-4">
                                <p className="text-xs text-muted-foreground text-center mb-3">
                                    {mode === "build" ? "Try asking:" : "Try these examples:"}
                                </p>
                                <div className="grid gap-2">
                                    {mode === "roast" ? (
                                        <>
                                            <button
                                                onClick={() => setInputValue("Rate my build: Ryzen 5 7600, RTX 4060, 32GB DDR5, B650 Tomahawk, 450W PSU")}
                                                className="text-left text-sm px-4 py-3 rounded-lg border border-orange-500/30 bg-orange-500/5 text-orange-200 hover:bg-orange-500/10 transition-colors"
                                            >
                                                🔥 Ryzen 5 7600 + RTX 4060 + <strong>450W PSU</strong> (weak PSU)
                                            </button>
                                            <button
                                                onClick={() => setInputValue("Roast this: Intel i5-14400F with B650 motherboard, RTX 4060 Ti, 16GB DDR5")}
                                                className="text-left text-sm px-4 py-3 rounded-lg border border-orange-500/30 bg-orange-500/5 text-orange-200 hover:bg-orange-500/10 transition-colors"
                                            >
                                                🔥 i5-14400F + <strong>B650 motherboard</strong> (socket mismatch!)
                                            </button>
                                            <button
                                                onClick={() => setInputValue("Check my build: Ryzen 5 7600, RTX 4060, 32GB Trident Z5, B650 Tomahawk, 750W Corsair RM, Lancool II Mesh, WD SN770 1TB, AK620 cooler")}
                                                className="text-left text-sm px-4 py-3 rounded-lg border border-orange-500/30 bg-orange-500/5 text-orange-200 hover:bg-orange-500/10 transition-colors"
                                            >
                                                ✅ Complete balanced build (let me find issues!)
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setInputValue("I have ₹80,000 budget for a gaming PC. I play GTA, Valorant and some Blender work.")}
                                                className="text-left text-sm px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 text-primary/80 hover:bg-primary/10 transition-colors"
                                            >
                                                ₹80k gaming + Blender build
                                            </button>
                                            <button
                                                onClick={() => setInputValue("What's the best GPU under ₹30,000 for 1080p gaming?")}
                                                className="text-left text-sm px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 text-primary/80 hover:bg-primary/10 transition-colors"
                                            >
                                                Best GPU under ₹30k
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <Message key={message.id} from={message.role}>
                                <MessageContent>
                                    {renderMessageContent(message)}
                                </MessageContent>
                            </Message>
                        ))
                    )}

                    {/* Loading indicator */}
                    {isLoading && messages[messages.length - 1]?.role === "user" && (
                        <Message from="assistant">
                            <MessageContent>
                                <div className="flex items-center gap-2">
                                    <Loader /> <span className="text-xs text-muted-foreground">Analyzing market prices...</span>
                                </div>
                            </MessageContent>
                        </Message>
                    )}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            {/* Input Area */}
            <div className="border-t border-border/40 bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto max-w-3xl">
                    <PromptInput onSubmit={handleSubmit}>
                        <PromptInputTextarea
                            placeholder={mode === "build" ? "I want a gaming PC for..." : "Rate my build: Ryzen 5 7600..."}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="min-h-[60px]"
                        />
                        <PromptInputFooter>
                            <div className="text-xs text-muted-foreground">
                                {mode === "build" ? "Searching 10+ Indian retailers" : "Strict analysis mode"}
                            </div>
                            <PromptInputSubmit
                                status={status}
                                onStop={stop}
                                disabled={!inputValue.trim() && !isLoading}
                            />
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </div>
        </div>
    );
}
