// contracts/risk-eval/src/storage.rs

use soroban_sdk::{contracttype, Address, symbol_short};

#[contracttype]
pub enum RiskKey {
    Portfolio(Address),
    Volatility(symbol_short),
    Correlation(symbol_short, symbol_short),
    RiskHistory(Address),
}