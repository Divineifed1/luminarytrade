// contracts/risk-eval/src/portfolio.rs

use soroban_sdk::{Env, Address, Map, symbol_short};
use crate::types::*;
use crate::storage::RiskKey;

pub fn get_portfolio(env: &Env, user: Address) -> Portfolio {
    env.storage()
        .instance()
        .get(&RiskKey::Portfolio(user))
        .unwrap()
}

pub fn concentration_risk(portfolio: &Portfolio) -> u32 {
    let total: i128 = portfolio.assets.values().iter().sum();

    let mut max_ratio = 0;

    for amount in portfolio.assets.values().iter() {
        let ratio = (*amount * 100 / total) as u32;
        if ratio > max_ratio {
            max_ratio = ratio;
        }
    }

    max_ratio // higher = worse
}