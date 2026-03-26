// contracts/risk-eval/src/stress_test.rs

pub fn stress_test(portfolio_value: i128) -> u32 {
    // simulate 20% drop
    let stressed = portfolio_value * 80 / 100;
    (portfolio_value - stressed) as u32
}