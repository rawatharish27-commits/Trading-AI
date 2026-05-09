import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Trading AI Agent RAG",
    version: "2.0.0",
    status: "running",
    features: [
      "SMC Engine",
      "Multi-Timeframe Analysis",
      "Live Data Feed",
      "Risk Management",
      "Real-time Quotes"
    ],
    timestamp: new Date().toISOString()
  });
}
