/**
 * The demo fleet: three AI agents, each with a distinct mandate and spend
 * currency. These are the agents that request funds from Comptroller.
 *
 * MCCs: 7311 = advertising; 5734/7372 = software/data processing;
 * 7375 = information retrieval services; 5812 = restaurants (used as an
 * off-mandate example for the "live decline" moment).
 */

import { toMinor } from "../money";
import type { AgentPolicy } from "../mandate/types";

export const SEED_AGENTS: AgentPolicy[] = [
  {
    agentId: "ad-buyer",
    displayName: "Ad Buyer Agent",
    baseCurrency: "USD",
    allowedCurrencies: ["USD"],
    allowedMerchantCategories: ["7311"], // advertising only
    perTaskCapMinor: toMinor(500),
    dailyCapMinor: toMinor(1000),
    autoApproveThresholdMinor: toMinor(500),
  },
  {
    agentId: "saas-procurement",
    displayName: "SaaS Procurement Agent",
    baseCurrency: "EUR",
    allowedCurrencies: ["EUR"],
    allowedMerchantCategories: ["5734", "7372"], // software / data processing
    perTaskCapMinor: toMinor(1000),
    dailyCapMinor: toMinor(2000),
    autoApproveThresholdMinor: toMinor(200), // €200+ needs human approval
  },
  {
    agentId: "data-vendor",
    displayName: "Data Vendor Agent",
    baseCurrency: "GBP",
    allowedCurrencies: ["GBP"],
    allowedMerchantCategories: ["7375", "5817"], // information services / digital goods
    perTaskCapMinor: toMinor(800),
    dailyCapMinor: toMinor(1500),
    autoApproveThresholdMinor: toMinor(300),
  },
];
