import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type PredevChoice = "sync" | "both" | "skip";

function runStep(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    console.error(`[predev] Failed to run: ${command} ${args.join(" ")}`);
    console.error(result.error);
    process.exit(1);
  }
}

async function askChoice(): Promise<PredevChoice> {
  const envChoice = (process.env.PREDEV_PREP || "").trim().toLowerCase();
  if (envChoice === "sync" || envChoice === "both" || envChoice === "skip") {
    return envChoice;
  }

  if (!process.stdin.isTTY) {
    return "sync";
  }

  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question(
      [
        "\nPre-dev data preparation:",
        "  1) Sync products only (recommended)",
        "  2) Sync + generate embeddings",
        "  3) Skip prep",
        "Choose [1/2/3] (default: 1): ",
      ].join("\n")
    );

    const choice = answer.trim();
    if (choice === "2") return "both";
    if (choice === "3") return "skip";
    return "sync";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const choice = await askChoice();

  if (choice === "skip") {
    console.log("[predev] Skipping data prep.");
    return;
  }

  runStep("bun", ["run", "sync-data"]);

  if (choice === "both") {
    runStep("bun", ["run", "generate-embeddings"]);
  }
}

main().catch((error) => {
  console.error("[predev] Unexpected error:", error);
  process.exit(1);
});
