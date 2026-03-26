// contracts/risk-eval/src/var.rs

pub fn calculate_var(portfolio_value: i128, volatility: u32) -> u32 {
    // simplified VaR (95%)
    // VaR = value * volatility * 1.65

    let var = portfolio_value * volatility as i128 * 165 / 10000;
    var as u32
}