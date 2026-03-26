// contracts/risk-eval/src/types.rs

use soroban_sdk::{contracttype, Address, Map, symbol_short};

#[contracttype]
#[derive(Clone)]
pub struct Portfolio {
    pub owner: Address,
    pub assets: Map<symbol_short, i128>, // asset -> amount
}

#[contracttype]
#[derive(Clone)]
pub struct AssetRisk {
    pub volatility: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Correlation {
    pub asset_a: symbol_short,
    pub asset_b: symbol_short,
    pub value: i32, // -100 to 100
}

#[contracttype]
#[derive(Clone)]
pub struct RiskScore {
    pub total: u32,
    pub credit: u32,
    pub market: u32,
    pub concentration: u32,
    pub liquidity: u32,
}