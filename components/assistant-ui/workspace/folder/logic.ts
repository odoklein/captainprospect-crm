/**
 * Compatibility re-export: the folder home's pure logic lives in
 * lib/assistant/client/folder-logic.ts (so lib/ never imports components/).
 *     npx tsx --test components/assistant-ui/workspace/folder/logic.test.ts
 */

// Relative on purpose: `tsx --test` resolves it without the tsconfig path alias.
export * from "../../../../lib/assistant/client/folder-logic";
