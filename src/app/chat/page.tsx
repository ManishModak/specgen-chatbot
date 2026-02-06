"use client";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { ProductCard } from "@/components/product-card";
import { Product } from "@/lib/products";

export default function ChatPage() {
    const [inputValue, setInputValue] = useState("");
    const [mode, setMode] = useState<"build" | "roast">("build");
    const [productsMap, setProductsMap] = useState<Map<string, Product>>(new Map());

    // Load products on mount
    useEffect(() => {
        fetch("/api/products")
            .then(res => res.json())
            .then((products: Product[]) => {
                const map = new Map<string, Product>();
                products.forEach(p => map.set(p.id, p));
                setProductsMap(map);
                console.log(`[Client] Loaded ${map.size} products`);
            })
            .catch(err => console.error("Failed to load products:", err));
    }, []);

    // Create transport that includes mode in body
    const transport = useMemo(() => new DefaultChatTransport({
        api: "/api/chat",
        body: { mode },
    }), [mode]);

    const { messages, sendMessage, status, stop, setMessages } = useChat({
        id: "specgen-chat",
        transport,
    });

    const isLoading = status === "streaming" || status === "submitted";

    // Parse [[PRODUCT:id]] tags and convert to segments
    const parseProductTags = (text: string): Array<{ type: 'text' | 'product', content: string }> => {
        const regex = /\[\[PRODUCT:([^\]]+)\]\]/g;
        const segments: Array<{ type: 'text' | 'product', content: string }> = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
            }
            segments.push({ type: 'product', content: match[1] });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            segments.push({ type: 'text', content: text.slice(lastIndex) });
        }

        return segments.length > 0 ? segments : [{ type: 'text', content: text }];
    };

    // Get message text content
    const getMessageText = (message: typeof messages[0]): string => {
        if (message.parts) {
            return message.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map(p => p.text)
                .join("");
        }
        return "";
    };

    // Render message content with product cards
    const renderMessageContent = (message: typeof messages[0]) => {
        const text = getMessageText(message);

        if (message.role === "user") {
            return <p className="whitespace-pre-wrap">{text}</p>;
        }

        const segments = parseProductTags(text);
        const hasProducts = segments.some(s => s.type === 'product');

        if (!hasProducts) {
            return <MessageResponse>{text}</MessageResponse>;
        }

        return (
            <div className="space-y-4">
                {segments.map((segment, i) => {
                    if (segment.type === 'text' && segment.content.trim()) {
                        return <MessageResponse key={i}>{segment.content}</MessageResponse>;
                    } else if (segment.type === 'product') {
                        const product = productsMap.get(segment.content);
                        if (product) {
                            return <ProductCard key={i} product={product} compact />;
                        }
                        return null;
                    }
                    return null;
                })}
            </div>
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
                    <PromptInput onSubmit={() => {
                        if (inputValue.trim()) {
                            sendMessage({ text: inputValue });
                            setInputValue("");
                        }
                    }}>
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
