// contracts/risk-eval/src/correlation.rs

use soroban_sdk::{Env, symbol_short};
use crate::storage::RiskKey;

pub fn get_correlation(env: &Env, a: symbol_short, b: symbol_short) -> i32 {
    env.storage()
        .instance()
        .get(&RiskKey::Correlation(a, b))
        .unwrap_or(0)
}

// diversification score (lower correlation = better)
pub fn diversification_score(env: &Env, assets: Vec<symbol_short>) -> u32 {
    let mut total_corr = 0;
    let mut count = 0;

    for i in 0..assets.len() {
        for j in i+1..assets.len() {
            total_corr += get_correlation(env, assets.get(i).unwrap(), assets.get(j).unwrap());
            count += 1;
        }
    }

    if count == 0 {
        return 0;
    }

    (total_corr / count) as u32
}