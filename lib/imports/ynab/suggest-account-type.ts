import type { AccountBudgetKind, AccountType } from "@/lib/types/budget";

export type YnabAccountTypeChoice =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "loan"
  | "tracking_asset"
  | "tracking_liability";

export interface AccountTypeSuggestion {
  accountName: string;
  suggestedType: YnabAccountTypeChoice;
  suggestedKind: AccountBudgetKind;
  confidence: "high" | "medium" | "low";
}

export function toAppAccountType(choice: YnabAccountTypeChoice): AccountType {
  switch (choice) {
    case "checking":
      return "checking";
    case "savings":
      return "savings";
    case "cash":
      return "cash";
    case "credit_card":
      return "credit_card";
    case "loan":
      return "personal_loan";
    case "tracking_asset":
      return "investment_tracking";
    case "tracking_liability":
      return "liability_tracking";
  }
}

export function toAppAccountKind(
  choice: YnabAccountTypeChoice,
): AccountBudgetKind {
  if (choice === "credit_card" || choice === "loan") return "credit";
  if (choice === "tracking_asset" || choice === "tracking_liability") {
    return "tracking";
  }
  return "on_budget";
}

export function suggestAccountType(accountName: string): AccountTypeSuggestion {
  const n = accountName.toLowerCase();

  if (
    n.includes("credit") ||
    n.includes("visa") ||
    n.includes("mastercard") ||
    n.includes("amex") ||
    n.includes("discover") ||
    n.includes("sapphire") ||
    n.includes("freedom") ||
    n.includes("reserve") ||
    /\bcc\b/.test(n) ||
    n.includes("card")
  ) {
    return {
      accountName,
      suggestedType: "credit_card",
      suggestedKind: "credit",
      confidence: "high",
    };
  }

  if (
    n.includes("loan") ||
    n.includes("mortgage") ||
    n.includes("student") ||
    n.includes("auto loan")
  ) {
    return {
      accountName,
      suggestedType: "loan",
      suggestedKind: "credit",
      confidence: "high",
    };
  }

  if (
    n.includes("brokerage") ||
    n.includes("401k") ||
    n.includes("ira") ||
    n.includes("investment") ||
    n.includes("tracking") ||
    n.includes("crypto")
  ) {
    return {
      accountName,
      suggestedType: "tracking_asset",
      suggestedKind: "tracking",
      confidence: "medium",
    };
  }

  if (n.includes("hysa") || n.includes("savings") || n.includes("save")) {
    return {
      accountName,
      suggestedType: "savings",
      suggestedKind: "on_budget",
      confidence: "high",
    };
  }

  if (n.includes("cash") || n.includes("wallet") || n.includes("petty")) {
    return {
      accountName,
      suggestedType: "cash",
      suggestedKind: "on_budget",
      confidence: "medium",
    };
  }

  if (n.includes("checking") || n.includes("chequing") || n.includes("spend")) {
    return {
      accountName,
      suggestedType: "checking",
      suggestedKind: "on_budget",
      confidence: "high",
    };
  }

  return {
    accountName,
    suggestedType: "checking",
    suggestedKind: "on_budget",
    confidence: "low",
  };
}

export function isCreditCardPaymentsGroup(name: string): boolean {
  return /^credit\s*card\s*payments?$/i.test(name.trim());
}
