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
                        <ConversationEmptyState
                            title={mode === "build" ? "PC Architect" : "Roast Master"}
                            description={
                                mode === "build"
                                    ? "Tell me your budget and what games you play (e.g. '₹80k for GTA 6')"
                                    : "Paste your PCPartPicker list or specs here. I'll destroy it."
                            }
                            icon={<MessageSquareIcon className="size-12 opacity-50" />}
                        />
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
